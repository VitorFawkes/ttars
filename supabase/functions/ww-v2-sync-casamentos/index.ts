// ============================================================================
// ww-v2-sync-casamentos — sync incremental do cache de casamentos fechados AC
//
// Lê AC API direto e popula ww_v2_casamentos_cache no WelcomeCRM.
// Universo de "ganho" = mesma lógica do site weddings-kpi.vercel.app:
//   data_fechamento IS NOT NULL OR ww_closer_data_hora_ganho IS NOT NULL
//   EXCLUI motivos_qualificacao_sdr = 'Para closer ter mais reuniões'
//
// Modos:
//   - bootstrap: re-popula cache inteiro (usar manualmente, raro)
//   - incremental: detecta deals modificados nos últimos N dias e atualiza
//
// Custom fields buscados no AC pra cada contato ganho:
//   - Deal field 27 (orçamento form), 26 (convidados form), 28 (destino form)
//   - Deal field 62 (pacote convidados), 121 (destino refinado), 64 (valor assess), 68 (Monde)
//   - Deal field 279 (fonte do lead)
//   - Contact field 376 (orçamento total casamento), 121 (previsão convidados)
//
// Deploy: `npx supabase functions deploy ww-v2-sync-casamentos --no-verify-jwt`
// Cron: a cada 1h via pg_cron (criar separadamente)
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AC_PIPELINES_WEDDING = [1, 3, 4, 5, 10, 12, 14, 17, 18, 19, 22, 23, 24, 25, 31]

type AcDeal = {
  id: string
  contact?: string
  group?: string
  fields?: Record<string, string>
}

type AcContact = {
  id: string
  firstName?: string
  lastName?: string
  email?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const log: Record<string, unknown> = { started_at: new Date().toISOString() }

  try {
    const body = await req.json().catch(() => ({})) as { mode?: 'bootstrap' | 'incremental', days?: number }
    const mode = body.mode ?? 'incremental'
    const days = body.days ?? 7
    log.mode = mode
    log.days = days

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get AC creds
    const { data: urlRpc } = await supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_URL' })
    const { data: keyRpc } = await supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_KEY' })
    const AC_URL = (urlRpc as string | null) ?? ''
    const AC_KEY = (keyRpc as string | null) ?? ''
    if (!AC_URL || !AC_KEY) {
      throw new Error('AC credentials missing')
    }
    log.ac_url_set = !!AC_URL

    const acFetch = async (path: string): Promise<unknown> => {
      const res = await fetch(`${AC_URL}${path}`, { headers: { 'Api-Token': AC_KEY } })
      if (!res.ok) throw new Error(`AC ${path}: ${res.status}`)
      return res.json()
    }

    // Buscar deals "ganhos" via filtros AC
    // Critério: data_fechamento OR ww_closer_data_hora_ganho preenchido
    // O endpoint /deals com filters[has_custom_field] não suporta exatamente isso,
    // então buscamos por pipeline wedding + status e filtramos client-side via custom field.
    // Pra mode=bootstrap: paginar todos os deals weddings. Pra incremental: usar
    // filters[orders][mdate]=desc e parar quando mdate < (now - days).

    const wonDeals: AcDeal[] = []
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
    log.cutoff = cutoff

    for (const groupId of AC_PIPELINES_WEDDING) {
      let offset = 0
      const limit = 100
      let pages = 0
      const maxPages = mode === 'bootstrap' ? 50 : 5
      while (pages < maxPages) {
        const path = `/api/3/deals?filters[group]=${groupId}&filters[orders][mdate]=DESC&limit=${limit}&offset=${offset}`
        const resp = await acFetch(path) as { deals?: AcDeal[] }
        const deals = resp.deals ?? []
        if (deals.length === 0) break

        for (const d of deals) {
          // Incremental: parar se mdate < cutoff (deal não modificado recentemente)
          const mdate = (d as unknown as { mdate?: string })?.mdate ?? ''
          if (mode === 'incremental' && mdate && mdate < cutoff) {
            pages = maxPages // break outer
            break
          }
          // Filtrar por data_fechamento OR ww_closer_data_hora_ganho via /deals/{id}/dealCustomFieldData
          const fieldRes = await acFetch(`/api/3/deals/${d.id}/dealCustomFieldData`) as { dealCustomFieldData?: Array<{ customFieldId: string, fieldValue: string }> }
          const fields = Object.fromEntries(
            (fieldRes.dealCustomFieldData ?? []).map(f => [f.customFieldId, f.fieldValue])
          )
          // Field 84 = data_fechamento, 81 = ww_closer_data_hora_ganho (validar)
          const dataFechamento = fields['84'] ?? fields['81'] ?? ''
          const motivoSdr = fields['68'] ?? '' // motivos_qualificacao_sdr field id (validar)
          if (dataFechamento && motivoSdr !== 'Para closer ter mais reuniões') {
            wonDeals.push({ ...d, fields })
          }
        }
        offset += limit
        pages += 1
      }
    }
    log.won_deals_count = wonDeals.length

    // Pra cada deal ganho, montar registro do cache
    const cacheRows: Record<string, unknown>[] = []
    const contactCache = new Map<string, AcContact>()

    for (const d of wonDeals) {
      const cid = d.contact
      if (!cid) continue
      if (!contactCache.has(cid)) {
        const contactRes = await acFetch(`/api/3/contacts/${cid}`) as { contact?: AcContact }
        if (contactRes.contact) contactCache.set(cid, contactRes.contact)
      }
      const contact = contactCache.get(cid)

      // Buscar field values do contato (376, 121)
      const fvRes = await acFetch(`/api/3/contacts/${cid}/fieldValues`) as { fieldValues?: Array<{ field: string, value: string }> }
      const contactFields = Object.fromEntries(
        (fvRes.fieldValues ?? []).map(f => [f.field, f.value])
      )

      cacheRows.push({
        contact_id: cid,
        deal_ganho_id: d.id,
        data_ganho: d.fields?.['84'] ?? d.fields?.['81'] ?? null,
        pipeline_ganho: d.group,
        contato_nome: contact ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() : null,
        contato_email: contact?.email ?? null,
        // Entrada (form site)
        entrada_invest: d.fields?.['27'] ?? null,
        entrada_conv: d.fields?.['26'] ?? null,
        entrada_destino: d.fields?.['28'] ?? null,
        // Realidade deal-level
        real_pacote_conv: d.fields?.['62'] ? parseInt(d.fields['62']) || null : null,
        real_destino: d.fields?.['121'] ?? null,
        real_num_conv: null,
        real_valor_assess: d.fields?.['64'] ? parseFloat(d.fields['64']) || null : null,
        real_monde: d.fields?.['68'] ?? null,
        // Realidade contact-level
        real_orcamento_total: contactFields['376'] ?? null,
        real_previsao_conv: contactFields['121'] ?? null,
        fonte_lead: d.fields?.['279'] ?? null,
        deal_ids: [d.id],
        raw_data: { deal_fields: d.fields, contact_fields: contactFields },
        synced_at: new Date().toISOString(),
      })
    }
    log.cache_rows = cacheRows.length

    if (cacheRows.length > 0) {
      const { error } = await supabase
        .from('ww_v2_casamentos_cache')
        .upsert(cacheRows, { onConflict: 'contact_id' })
      if (error) throw new Error(`Upsert error: ${error.message}`)
      log.upsert_ok = true
    }

    log.finished_at = new Date().toISOString()
    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    log.error = String(e)
    log.error_stack = e instanceof Error ? e.stack : undefined
    return new Response(JSON.stringify({ ok: false, log }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      status: 500,
    })
  }
})
