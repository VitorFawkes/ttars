// ============================================================================
// ww-ac-journey-reconcile — REDE DE SEGURANÇA da jornada (ww_deal_event).
//
// A jornada se mantém em tempo real pelo webhook (ww-ac-funnel-sync-incremental).
// Esta função é o "belt-and-suspenders": uma vez ao dia re-puxa a jornada dos
// casais ATIVOS nas esteiras de fechamento (Closer 3 / Planejamento 4 / Elopement
// 12), caso algum aviso do Active tenha se perdido.
//
// Pra caber no limite de tempo de UMA execução, processa de forma ROTATIVA por
// hora: cada execução cuida de ~1/24 dos casais (hash(ac_deal_id) % 24 == hora
// UTC atual). Cron de hora em hora => cobre todos 1x/dia, sem estado/cursor.
//
// Upsert idempotente por ac_activity_id (não duplica). org_id explícito.
// Deploy: npx supabase functions deploy ww-ac-journey-reconcile --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu
// Cron:   de hora em hora via pg_cron.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WEDDING_ORG = 'b0000000-0000-0000-0000-000000000002'
const FECHAMENTO_GROUPS = '(3,4,12)'   // Closer, Planejamento, Elopement
const PACING_MS = 220                   // ~4.5 req/s, abaixo do limite AC (~5/s)

function parseDateTime(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  if (!t || t.startsWith('0000-00-00')) return null
  const d = new Date(t.includes('T') || t.includes(' ') ? t : t + 'T00:00:00Z')
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// hash simples e estável (djb2) p/ rotação por hora
function hash24(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h % 24
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const startedAt = Date.now()
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const [urlRes, keyRes] = await Promise.all([
      supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_URL' }),
      supabase.rpc('get_outbound_setting', { p_key: 'ACTIVECAMPAIGN_API_KEY' }),
    ])
    const AC_URL = (urlRes.data as string | null)?.replace(/\/+$/, '')
    const AC_KEY = keyRes.data as string | null
    if (!AC_URL || !AC_KEY) throw new Error('AC credentials missing')
    const acFetch = async <T,>(path: string): Promise<T> => {
      const res = await fetch(`${AC_URL}${path}`, { headers: { 'Api-Token': AC_KEY! } })
      if (!res.ok) throw new Error(`AC ${res.status} on ${path}`)
      return await res.json() as T
    }

    // 1) coletar deals ativos nas esteiras de fechamento (paginado)
    type Row = { ac_deal_id: string; contact_id: string | null }
    const all: Row[] = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase
        .from('ww_ac_deal_funnel_cache')
        .select('ac_deal_id, contact_id')
        .filter('pipeline_group_id', 'in', FECHAMENTO_GROUPS)
        .range(from, from + 999)
      if (error) throw new Error(`select cache: ${error.message}`)
      const batch = (data ?? []) as Row[]
      all.push(...batch)
      if (batch.length < 1000) break
    }

    // 2) fatia da hora atual (rotação): só os que hash%24 == hora UTC
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const hour = typeof body.hour === 'number' ? body.hour : new Date().getUTCHours()
    const slice = all.filter((r) => hash24(String(r.ac_deal_id)) === hour)

    // 3) re-puxa a jornada de cada um, upsert idempotente.
    // Trava de tempo: para em 125s (o que sobrar entra no ciclo da prox hora/dia).
    let ok = 0, err = 0, ev = 0, pulados = 0
    for (const r of slice) {
      if (Date.now() - startedAt > 125000) { pulados = slice.length - ok - err; break }
      try {
        type AcAct = { id: string | number; dataType?: string; cdate?: string; dataOldval?: string | null; dataAction?: string | null; userid?: string | number | null }
        const acts: AcAct[] = []
        for (let offset = 0; offset < 2000; offset += 100) {
          const j = await acFetch<{ dealActivities?: AcAct[] }>(`/api/3/deals/${r.ac_deal_id}/dealActivities?limit=100&offset=${offset}`)
          const batch = j.dealActivities ?? []
          acts.push(...batch)
          if (batch.length < 100) break
        }
        const events = acts
          .filter((a) => a.dataType === 'd_stageid' || a.dataType === 'd_groupid')
          .map((a) => ({
            ac_deal_id: String(r.ac_deal_id), org_id: WEDDING_ORG, ac_activity_id: String(a.id),
            event_ts: parseDateTime(a.cdate), kind: a.dataType === 'd_groupid' ? 'esteira' : 'etapa',
            from_id: a.dataOldval != null ? String(a.dataOldval) : null,
            to_id: a.dataAction != null ? String(a.dataAction) : null,
            by_user: a.userid != null ? String(a.userid) : null,
            by_automation: false, contact_id: r.contact_id ? String(r.contact_id) : null,
          }))
        if (events.length) {
          const { error } = await supabase.from('ww_deal_event').upsert(events, { onConflict: 'ac_activity_id' })
          if (error) throw new Error(error.message)
          ev += events.length
        }
        ok++
      } catch (e) {
        err++
        if (err <= 3) console.warn(`reconcile deal ${r.ac_deal_id}:`, (e as Error).message)
      }
      await sleep(PACING_MS)
    }

    return new Response(JSON.stringify({
      ok: true, hour, total_ativos: all.length, fatia_da_hora: slice.length,
      reconciliados: ok, erros: err, pulados, eventos_upsert: ev, duration_ms: Date.now() - startedAt,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, duration_ms: Date.now() - startedAt }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
