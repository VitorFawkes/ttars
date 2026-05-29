// ============================================================================
// ww-ac-funnel-sync-incremental — sincroniza 1 deal AC por vez
//
// Chamada por:
//   - ww-ac-webhook-receiver (fire-and-forget após receber webhook)
//   - manual (debug/replay): POST { deal_id: "12345" }
//
// Fluxo:
//   1. Recebe { deal_id, event_id?, source? }
//   2. Busca deal completo na AC API (incluindo customFieldData)
//   3. Filtra: só processa se group ∈ WW_PIPELINE_GROUPS
//   4. Computa marcos do funil + realidade do casal (mesma lógica de ww-ac-funnel-sync)
//   5. UPSERT em ww_ac_deal_funnel_cache
//   6. Se event_id fornecido, marca evento como 'processed' em ac_event_raw
//
// Performance: ~2-3s por deal (1 GET deal + 1 GET dealCustomFieldData + UPSERT).
// Idempotente: pode rodar 2× pro mesmo deal sem efeito colateral.
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
const FIELD_DEAL_PACOTE_CONV = '62'
const CONTACT_FIELD_CONVIDADOS = '121'
const CONTACT_FIELD_ORCAMENTO  = '376'

type Deal = { id: string; group: string | null; title: string | null; contact?: string | null }

function parseDateTime(v: string | null | undefined): string | null {
  if (!v) return null
  const trimmed = v.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('0000-00-00')) return null
  const date = new Date(trimmed.includes('T') || trimmed.includes(' ') ? trimmed : trimmed + 'T00:00:00Z')
  if (isNaN(date.getTime())) return null
  return date.toISOString()
}

function parseMultiselect(v: string | null | undefined): string[] {
  if (!v) return []
  const trimmed = v.trim()
  if (!trimmed || trimmed === '[]') return []
  try {
    const parsed = JSON.parse(trimmed.replace(/'/g, '"'))
    if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean)
  } catch { /* fallback */ }
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
  let dealId: string | null = null
  let eventId: number | null = null

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    dealId = body.deal_id ? String(body.deal_id) : null
    eventId = body.event_id ? Number(body.event_id) : null

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'deal_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      throw new Error('AC credentials missing')
    }

    async function acFetch<T = unknown>(path: string): Promise<T> {
      const res = await fetch(`${AC_URL}${path}`, { headers: { 'Api-Token': AC_KEY! } })
      if (!res.ok) throw new Error(`AC ${res.status} on ${path}: ${(await res.text()).substring(0, 200)}`)
      return await res.json() as T
    }

    // 1. Buscar deal + custom field data em paralelo
    const [dealRes, fieldsRes] = await Promise.all([
      acFetch<{ deal: Deal | null }>(`/api/3/deals/${dealId}`),
      acFetch<{ dealCustomFieldData: Array<{ customFieldId: string | number; fieldValue: string | null }> }>(
        `/api/3/deals/${dealId}/dealCustomFieldData`
      ),
    ])

    const deal = dealRes.deal
    if (!deal) {
      // Deal foi deletado na AC. Marcar evento como skipped.
      if (eventId) {
        await supabase.rpc('ac_event_raw_mark_processed', {
          p_id: eventId, p_status: 'skipped', p_error: 'deal_not_found_in_ac',
        })
      }
      return new Response(JSON.stringify({ ok: true, skipped: 'deal_not_found', deal_id: dealId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groupId = deal.group ? parseInt(deal.group, 10) : null
    const isWw = groupId !== null && WW_PIPELINE_GROUPS.has(groupId)

    // 2. Construir mapa de campos do deal
    const fieldMap: Record<string, string | null> = {}
    for (const f of (fieldsRes.dealCustomFieldData ?? [])) {
      fieldMap[String(f.customFieldId)] = f.fieldValue ?? null
    }

    // 3. Buscar contact fields 376/121 se for WW e tiver contato
    let cFields: { f376?: string; f121?: string } = {}
    if (isWw && deal.contact) {
      try {
        const j = await acFetch<{ fieldValues?: Array<{ field: string | number; value: string | null }> }>(
          `/api/3/contacts/${deal.contact}?include=fieldValues`
        )
        for (const fv of (j.fieldValues ?? [])) {
          const fid = String(fv.field)
          const v = (fv.value ?? '').trim()
          if (!v || v === '||') continue
          if (fid === CONTACT_FIELD_ORCAMENTO) cFields.f376 = v
          else if (fid === CONTACT_FIELD_CONVIDADOS) cFields.f121 = v
        }
      } catch (e) {
        console.warn(`contact ${deal.contact} fetch failed:`, (e as Error).message)
      }
    }

    // 4. Computar marcos + realidade
    const sdrComoRaw = fieldMap[FIELD_SDR_COMO]
    const closerComoRaw = fieldMap[FIELD_CLOSER_COMO]
    const sdrChannels = parseMultiselect(sdrComoRaw)
    const sdrFez = sdrChannels.length > 0 && hasRealMeeting(sdrChannels)
    const sdrCanal = realMeetingChannels(sdrChannels)
    const closer = closerFromDropdown(closerComoRaw)

    const orcamentoRaw = isWw ? (cFields.f376 ?? null) : null
    let convidadosRaw: string | null = isWw ? (cFields.f121 ?? null) : null
    let convidadosFonte: string | null = convidadosRaw ? 'contact_121' : null
    if (isWw && !convidadosRaw && fieldMap[FIELD_DEAL_PACOTE_CONV]) {
      convidadosRaw = fieldMap[FIELD_DEAL_PACOTE_CONV]
      convidadosFonte = 'deal_62'
    }

    const row = {
      ac_deal_id: String(dealId),
      contact_id: deal.contact ?? null,
      pipeline_group_id: groupId,
      is_ww: isWw,
      deal_title: deal.title ?? null,
      sdr_agendou_at: parseDateTime(fieldMap[FIELD_SDR_AGENDOU]),
      sdr_fez: sdrFez,
      sdr_canal: sdrCanal.length ? sdrCanal : null,
      closer_agendou_at: parseDateTime(fieldMap[FIELD_CLOSER_AGEN]),
      closer_fez: closer.fez,
      closer_canal: closer.canal,
      ganho_at: parseDateTime(fieldMap[FIELD_GANHO]),
      real_orcamento_raw: orcamentoRaw,
      real_orcamento_parsed: parseOrcamento(orcamentoRaw),
      real_convidados_raw: convidadosRaw,
      real_convidados_parsed: parseConvidados(convidadosRaw),
      real_convidados_fonte: convidadosFonte,
      real_dados_synced_at: isWw ? new Date().toISOString() : null,
      synced_at: new Date().toISOString(),
    }

    // 5. UPSERT
    const { error: upsertErr } = await supabase
      .from('ww_ac_deal_funnel_cache')
      .upsert(row, { onConflict: 'ac_deal_id' })

    if (upsertErr) throw new Error(`upsert failed: ${upsertErr.message}`)

    // 6. Marcar evento como processado (se veio de webhook)
    if (eventId) {
      await supabase.rpc('ac_event_raw_mark_processed', {
        p_id: eventId,
        p_status: 'processed',
        p_error: null,
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      deal_id: dealId,
      is_ww: isWw,
      group: groupId,
      duration_ms: Date.now() - startedAt,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`sync incremental failed (deal ${dealId}):`, msg)

    // Marcar evento como erro se veio de webhook
    if (eventId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await supabase.rpc('ac_event_raw_mark_processed', {
          p_id: eventId, p_status: 'error', p_error: msg.substring(0, 500),
        })
      } catch (_) { /* silenced */ }
    }

    return new Response(JSON.stringify({ error: msg, deal_id: dealId, duration_ms: Date.now() - startedAt }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
