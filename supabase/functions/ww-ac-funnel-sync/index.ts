// ============================================================================
// ww-ac-funnel-sync — sincroniza ww_ac_deal_funnel_cache direto da AC API
//
// Popula 1 linha por deal AC com os 5 marcos canônicos do funil Weddings:
//   sdr_agendou_at  ← deal custom field 6  (datetime)
//   sdr_fez         ← deal custom field 17 (multiselect, ≠ "Não teve reunião")
//   sdr_canal       ← deal custom field 17 (valores reais)
//   closer_agendou_at ← deal custom field 18 (datetime)
//   closer_fez      ← deal custom field 299 (dropdown, ≠ "Não teve reunião")
//   closer_canal    ← deal custom field 299
//   ganho_at        ← deal custom field 87 (datetime, "WW Closer Data-Hora Ganho")
//
// is_ww = TRUE se deal.group ∈ {1,3,4,5,9,10,11,12,14,17,18,19,21,22,23}
//
// Modos:
//   - bootstrap: pagina tudo de dealCustomFieldData (~183k linhas), recria cache
//   - incremental: re-sincroniza só deals com synced_at < NOW() - 1h
//
// Deploy: `npx supabase functions deploy ww-ac-funnel-sync --no-verify-jwt`
// Cron:   a cada 30min via pg_cron (mode=incremental)
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WW_PIPELINE_GROUPS = new Set([1, 3, 4, 5, 9, 10, 11, 12, 14, 17, 18, 19, 21, 22, 23])
const FIELD_SDR_AGENDOU      = '6'
const FIELD_SDR_COMO         = '17'
const FIELD_CLOSER_AGEN      = '18'
const FIELD_CLOSER_COMO      = '299'
const FIELD_GANHO            = '87'
const FIELD_DEAL_PACOTE_CONV = '62'  // Fallback de convidados quando Contact 121 vazio
const FIELD_DEAL_MOTIVO_CLOSER = '47' // [WW] [Closer] Motivo de Perda (dropdown)
const FIELD_DEAL_MOTIVO_SDR    = '56' // SDR WT - Motivo de Perda (dropdown)
const FIELD_DEAL_ORCAMENTO     = '27' // Quanto você pensa em investir? (form do site)
const FIELD_DEAL_CONV_FORM     = '26' // Quantas pessoas vão no seu casamento? (form)
const FIELD_DEAL_DESTINO       = '28' // Onde você quer casar? (form)
const FIELD_DEAL_TIPO          = '30' // DW ou Elopment? (declarado)
const RELEVANT_FIELDS = new Set([FIELD_SDR_AGENDOU, FIELD_SDR_COMO, FIELD_CLOSER_AGEN, FIELD_CLOSER_COMO, FIELD_GANHO, FIELD_DEAL_PACOTE_CONV, FIELD_DEAL_MOTIVO_CLOSER, FIELD_DEAL_MOTIVO_SDR, FIELD_DEAL_ORCAMENTO, FIELD_DEAL_CONV_FORM, FIELD_DEAL_DESTINO, FIELD_DEAL_TIPO])

// Contact fields (Welcome Form pós-venda + atribuição de origem)
const CONTACT_FIELD_CONVIDADOS = '121'  // DW - Previsão nº de convidados
const CONTACT_FIELD_ORCAMENTO  = '376'  // DW - Qual o orçamento total do casamento
const CONTACT_FIELD_UTM_SOURCE = '46'
const CONTACT_FIELD_UTM_MEDIUM = '47'
const CONTACT_FIELD_UTM_CAMPAIGN = '48'
const CONTACT_FIELD_ORIGEM_CONVERSAO = '137'

type DealCustomFieldData = { dealId: number; customFieldId: number; fieldValue: string | null }
type Deal = { id: string; group: string | null; title: string | null; contact?: string | null; cdate?: string | null; status?: string | null; stage?: string | null }
type ContactFieldValue = { contact: string; field: string; value: string | null }

function parseDateTime(v: string | null | undefined): string | null {
  if (!v) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  if (trimmed === '0000-00-00 00:00:00' || trimmed === '0000-00-00') return null
  // AC pode retornar com timezone embutido (ISO 8601 with offset)
  const date = new Date(trimmed.includes('T') || trimmed.includes(' ') ? trimmed : trimmed + 'T00:00:00Z')
  if (isNaN(date.getTime())) return null
  return date.toISOString()
}

// Field 17 multiselect: armazenado como literal Python "['Vídeo']" ou "['Vídeo', 'Whatsapp']"
function parseMultiselect(v: string | null | undefined): string[] {
  if (!v) return []
  const trimmed = v.trim()
  if (!trimmed || trimmed === '[]') return []
  // Tenta parse como JSON
  try {
    const parsed = JSON.parse(trimmed.replace(/'/g, '"'))
    if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean)
  } catch {
    // fallback: valor cru
    return [trimmed]
  }
  return [trimmed]
}

function hasRealMeeting(values: string[]): boolean {
  return values.some(v => v.toLowerCase().trim() !== 'não teve reunião')
}

function realMeetingChannels(values: string[]): string[] {
  return values.filter(v => v.toLowerCase().trim() !== 'não teve reunião')
}

function closerFromDropdown(v: string | null | undefined): { fez: boolean; canal: string | null } {
  if (!v) return { fez: false, canal: null }
  const trimmed = v.trim().replace(/^\[['"]/, '').replace(/['"]\]$/, '')
  if (!trimmed) return { fez: false, canal: null }
  const lower = trimmed.toLowerCase()
  if (lower === 'não teve reunião') return { fez: false, canal: trimmed }
  return { fez: true, canal: trimmed }
}

// Parser de orçamento (textarea livre): "70mil", "R$80.000,00", "130 mil para tudo" → R$
function parseOrcamento(text: string | null | undefined): number | null {
  if (!text) return null
  const t = text.toLowerCase().trim()
  if (/nao sei|não sei|nao tenho|não tenho|nao defini|não defini|depende|nao deci|não deci/.test(t)) return null
  const matches = [...t.matchAll(/(\d+(?:[\.,]\d+)*)/g)]
  if (!matches.length) return null
  const parsed: number[] = []
  for (const m of matches) {
    const nclean = m[1].replace(/\./g, '').replace(/,/g, '.')
    let val = parseFloat(nclean)
    if (isNaN(val)) continue
    const idx = (m.index ?? 0) + m[1].length
    const following = t.substring(idx, idx + 15)
    if (/mil/.test(following)) val *= 1000
    else if (/milh/.test(following)) val *= 1000000
    parsed.push(val)
  }
  if (!parsed.length) return null
  return Math.max(...parsed)
}

function parseConvidados(text: string | null | undefined): number | null {
  if (!text) return null
  const m = text.match(/\d+/)
  if (!m) return null
  const v = parseInt(m[0], 10)
  if (v > 0 && v < 5000) return v
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startedAt = Date.now()
  let mode: 'bootstrap' | 'incremental' = 'incremental'
  try {
    const body = await req.text().catch(() => '')
    if (body) {
      try {
        const parsed = JSON.parse(body)
        if (parsed.mode === 'bootstrap') mode = 'bootstrap'
      } catch { /* ignore */ }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const [urlRes, keyRes] = await Promise.all([
      supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_URL' }),
      supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_KEY' }),
    ])
    const AC_URL = (urlRes.data as string | null)?.replace(/\/+$/, '')
    const AC_KEY = keyRes.data as string | null
    if (!AC_URL || !AC_KEY) {
      return new Response(JSON.stringify({ error: 'AC credentials missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    async function acFetch<T = unknown>(path: string): Promise<T> {
      const res = await fetch(`${AC_URL}${path}`, { headers: { 'Api-Token': AC_KEY! } })
      if (!res.ok) throw new Error(`AC ${res.status} on ${path}: ${(await res.text()).substring(0, 200)}`)
      return await res.json() as T
    }

    // ── Passo 1: paginar dealCustomFieldData e coletar por deal ───────────
    const dealData = new Map<string, Record<string, string | null>>()

    async function fetchPage(offset: number): Promise<{ rows: DealCustomFieldData[]; total: number }> {
      const j = await acFetch<{ dealCustomFieldData: DealCustomFieldData[]; meta: { total: string } }>(
        `/api/3/dealCustomFieldData?limit=100&offset=${offset}`
      )
      return { rows: j.dealCustomFieldData ?? [], total: parseInt(j.meta?.total ?? '0', 10) }
    }

    const first = await fetchPage(0)
    const total = first.total
    for (const r of first.rows) {
      if (!RELEVANT_FIELDS.has(String(r.customFieldId))) continue
      const id = String(r.dealId)
      if (!dealData.has(id)) dealData.set(id, {})
      dealData.get(id)![String(r.customFieldId)] = r.fieldValue == null ? null : String(r.fieldValue)
    }

    // Paginação em paralelo (max 10 concurrent)
    const offsets: number[] = []
    for (let o = 100; o < total; o += 100) offsets.push(o)
    const CONCURRENCY = 10
    for (let i = 0; i < offsets.length; i += CONCURRENCY) {
      const batch = offsets.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(o => fetchPage(o).catch(e => { console.error(`page ${o} failed:`, e); return { rows: [] as DealCustomFieldData[], total: 0 } })))
      for (const r of results) {
        for (const row of r.rows) {
          if (!RELEVANT_FIELDS.has(String(row.customFieldId))) continue
          const id = String(row.dealId)
          if (!dealData.has(id)) dealData.set(id, {})
          dealData.get(id)![String(row.customFieldId)] = row.fieldValue == null ? null : String(row.fieldValue)
        }
      }
    }

    const dealIds = Array.from(dealData.keys())
    console.log(`Coletados ${dealIds.length} deals com algum dos 5 campos relevantes (de ${total} fieldValues totais).`)

    // ── Passo 2: buscar metadados de cada deal (group + title + contact) ──
    async function fetchDeal(id: string): Promise<Deal | null> {
      try {
        const j = await acFetch<{ deal: Deal | null }>(`/api/3/deals/${id}`)
        return j.deal ?? null
      } catch (e) {
        console.warn(`deal ${id} not found:`, (e as Error).message)
        return null
      }
    }

    const dealMeta = new Map<string, Deal | null>()
    const META_CONC = 15
    for (let i = 0; i < dealIds.length; i += META_CONC) {
      const batch = dealIds.slice(i, i + META_CONC)
      const results = await Promise.all(batch.map(id => fetchDeal(id)))
      batch.forEach((id, idx) => dealMeta.set(id, results[idx]))
    }

    // ── Passo 2.5: buscar contact fields 121/376 dos contatos primários ───
    // Só pra deals WW (universo relevante pra Entrada × Realidade)
    const contactsToFetch = new Set<string>()
    for (const id of dealIds) {
      const deal = dealMeta.get(id)
      const gid = deal?.group ? parseInt(deal.group, 10) : null
      if (gid && WW_PIPELINE_GROUPS.has(gid) && deal?.contact) {
        contactsToFetch.add(String(deal.contact))
      }
    }
    console.log(`Buscando fields 376/121 de ${contactsToFetch.size} contatos WW...`)

    type ContactSnapshot = { f376?: string; f121?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; origem?: string }
    const contactFields = new Map<string, ContactSnapshot>()
    async function fetchContactFields(cid: string): Promise<void> {
      try {
        const j = await acFetch<{ fieldValues?: ContactFieldValue[] }>(`/api/3/contacts/${cid}?include=fieldValues`)
        const fvs = j.fieldValues ?? []
        const out: ContactSnapshot = {}
        for (const fv of fvs) {
          const fid = String(fv.field)
          const v = String(fv.value ?? '').trim()
          if (!v || v === '||') continue
          if (fid === CONTACT_FIELD_ORCAMENTO) out.f376 = v
          else if (fid === CONTACT_FIELD_CONVIDADOS) out.f121 = v
          else if (fid === CONTACT_FIELD_UTM_SOURCE) out.utm_source = v
          else if (fid === CONTACT_FIELD_UTM_MEDIUM) out.utm_medium = v
          else if (fid === CONTACT_FIELD_UTM_CAMPAIGN) out.utm_campaign = v
          else if (fid === CONTACT_FIELD_ORIGEM_CONVERSAO) out.origem = v
        }
        contactFields.set(cid, out)
      } catch (e) {
        console.warn(`contact ${cid} fetch failed:`, (e as Error).message)
        contactFields.set(cid, {})
      }
    }

    const contactList = Array.from(contactsToFetch)
    const CONTACT_CONC = 15
    for (let i = 0; i < contactList.length; i += CONTACT_CONC) {
      const batch = contactList.slice(i, i + CONTACT_CONC)
      await Promise.all(batch.map(c => fetchContactFields(c)))
    }

    // ── Passo 3: montar rows pra upsert ───────────────────────────────────
    const rows = dealIds.map(id => {
      const data = dealData.get(id)!
      const deal = dealMeta.get(id)
      const groupId = deal?.group ? parseInt(deal.group, 10) : null
      const isWw = groupId !== null && WW_PIPELINE_GROUPS.has(groupId)
      const sdrComoRaw = data[FIELD_SDR_COMO]
      const closerComoRaw = data[FIELD_CLOSER_COMO]
      const sdrChannels = parseMultiselect(sdrComoRaw)
      const sdrFez = sdrChannels.length > 0 && hasRealMeeting(sdrChannels)
      const sdrCanal = realMeetingChannels(sdrChannels)
      const closer = closerFromDropdown(closerComoRaw)
      // Realidade do casal — Welcome Form (só pra deals WW)
      const cid = deal?.contact ? String(deal.contact) : null
      const cFields = cid && isWw ? contactFields.get(cid) : undefined
      const orcamentoRaw = cFields?.f376 ?? null
      // Convidados: Contact 121 (primary) ou Deal 62 (fallback)
      let convidadosRaw: string | null = cFields?.f121 ?? null
      let convidadosFonte: string | null = convidadosRaw ? 'contact_121' : null
      if (isWw && !convidadosRaw && data[FIELD_DEAL_PACOTE_CONV]) {
        convidadosRaw = data[FIELD_DEAL_PACOTE_CONV]
        convidadosFonte = 'deal_62'
      }
      const orcamentoParsed = parseOrcamento(orcamentoRaw)
      const convidadosParsed = parseConvidados(convidadosRaw)

      return {
        ac_deal_id: id,
        contact_id: deal?.contact ?? null,
        pipeline_group_id: groupId,
        is_ww: isWw,
        // 20260612d: status do Active (0=aberto,1=ganho,2/3=perdido) — usado por is_perdido
        ac_status: deal?.status != null ? parseInt(String(deal.status), 10) : null,
        // 20260616f: etapa atual do deal no Active (posição atual confiável do casal)
        ac_current_stage_id: deal?.stage != null ? String(deal.stage) : null,
        deal_title: deal?.title ?? null,
        sdr_agendou_at: parseDateTime(data[FIELD_SDR_AGENDOU]),
        sdr_fez: sdrFez,
        sdr_canal: sdrCanal.length ? sdrCanal : null,
        closer_agendou_at: parseDateTime(data[FIELD_CLOSER_AGEN]),
        closer_fez: closer.fez,
        closer_canal: closer.canal,
        ganho_at: parseDateTime(data[FIELD_GANHO]),
        // Dimensões DECLARADAS no form do site (campos do DEAL) — só p/ deals WW.
        // Cru (a limpeza/normalização acontece depois, no refresh_ww_funil_casal).
        faixa_raw:      isWw ? (data[FIELD_DEAL_ORCAMENTO] ?? null) : null,
        convidados_raw: isWw ? (data[FIELD_DEAL_CONV_FORM] ?? null) : null,
        destino_raw:    isWw ? (data[FIELD_DEAL_DESTINO]   ?? null) : null,
        tipo_casamento: isWw ? (data[FIELD_DEAL_TIPO]      ?? null) : null,
        deal_created_at: parseDateTime(deal?.cdate),
        real_orcamento_raw: orcamentoRaw,
        real_orcamento_parsed: orcamentoParsed,
        real_convidados_raw: convidadosRaw,
        real_convidados_parsed: convidadosParsed,
        real_convidados_fonte: convidadosFonte,
        real_dados_synced_at: isWw ? new Date().toISOString() : null,
        motivo_perda_closer_raw: data[FIELD_DEAL_MOTIVO_CLOSER] ?? null,
        motivo_perda_sdr_raw: data[FIELD_DEAL_MOTIVO_SDR] ?? null,
        utm_source: cFields?.utm_source ?? null,
        utm_medium: cFields?.utm_medium ?? null,
        utm_campaign: cFields?.utm_campaign ?? null,
        origem_conversao: cFields?.origem ?? null,
        synced_at: new Date().toISOString(),
      }
    })

    // ── Passo 4: upsert em lotes ──────────────────────────────────────────
    let upserted = 0
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('ww_ac_deal_funnel_cache').upsert(chunk, { onConflict: 'ac_deal_id' })
      if (error) { console.error('upsert failed at', i, error.message); throw error }
      upserted += chunk.length
    }

    // ── Passo 5: contagens de validação ───────────────────────────────────
    const { data: counts } = await supabase.rpc('ww_ac_funnel_validation_counts').single().then(
      r => ({ data: r.data as { sdr_agendou: number; sdr_fez: number; closer_agendou: number; closer_fez: number; ganho: number } | null }),
      () => ({ data: null })
    )

    return new Response(JSON.stringify({
      ok: true,
      mode,
      total_field_rows: total,
      deals_collected: dealIds.length,
      upserted,
      validation: counts,
      duration_ms: Date.now() - startedAt,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('sync failed:', msg)
    return new Response(JSON.stringify({ error: msg, duration_ms: Date.now() - startedAt }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
