// ============================================================================
// ww-ac-webhook-receiver — recebe webhooks da AC pra Welcome Weddings
//
// Fluxo:
//   1. AC POSTa form-encoded payload aqui (verify_jwt=false)
//   2. Extrai event_type + entity_type + entity_id
//   3. Gera dedup_key idempotente
//   4. Insere em ac_event_raw via RPC (idempotente — segundo insert é no-op)
//   5. Dispara ww-ac-funnel-sync-incremental fire-and-forget pro deal_id
//   6. Retorna 200 IMEDIATO pra AC (não bloqueia AC esperando processamento)
//
// Pipeline groups WW (de ww-ac-funnel-sync) — só processamos se for WW.
//
// Deploy: `npx supabase functions deploy ww-ac-webhook-receiver --no-verify-jwt --project-ref szyrzxvlptqqheizyrxu`
// Vitor configura URL no painel AC: https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/ww-ac-webhook-receiver
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// AC pode mandar como form-encoded OU JSON. Cobrimos os 2.
async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  const out: Record<string, string> = {}
  if (contentType.includes('application/json')) {
    const j = await req.json()
    // Achata: { deal: { id: 123 } } -> deal[id]=123
    flatten(j, '', out)
  } else {
    // form-encoded (default AC)
    const text = await req.text()
    const params = new URLSearchParams(text)
    params.forEach((v, k) => { out[k] = v })
  }
  return out
}

function flatten(obj: unknown, prefix: string, out: Record<string, string>) {
  if (obj === null || obj === undefined) return
  if (typeof obj !== 'object') {
    out[prefix || 'value'] = String(obj)
    return
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else if (v !== null && v !== undefined) out[key] = String(v)
  }
}

// Identifica event_type, entity_type, entity_id do payload AC
function classify(body: Record<string, string>): {
  event_type: string
  entity_type: 'deal' | 'contact' | 'other'
  entity_id: string | null
} {
  const event_type = body['type'] || body['event'] || 'unknown'

  // Deal: deal[id] ou deal_id
  const dealId = body['deal[id]'] || body['deal_id']
  if (dealId) return { event_type, entity_type: 'deal', entity_id: String(dealId) }

  // Contact: contact[id] ou contact_id
  const contactId = body['contact[id]'] || body['contact_id']
  if (contactId) return { event_type, entity_type: 'contact', entity_id: String(contactId) }

  return { event_type, entity_type: 'other', entity_id: null }
}

// Idempotência: hash composto. AC pode retry o mesmo evento após timeout.
// Inclui timestamp do payload (se houver) pra distinguir múltiplos updates legítimos.
async function generateDedupKey(
  event_type: string,
  entity_type: string,
  entity_id: string,
  body: Record<string, string>
): Promise<string> {
  // AC inclui ?? Sem timestamp confiável no payload. Usamos:
  //   event_type + entity_id + udate (campo "updated date" do AC) OR cdate
  // Se nem isso, usamos hash do payload inteiro (assume que payload idêntico = evento idêntico)
  const updateMarker = body['deal[udate]'] || body['contact[udate]'] || body['deal[cdate]'] || body['contact[cdate]'] || ''
  const base = `${event_type}|${entity_type}|${entity_id}|${updateMarker}`
  // Se ainda assim ambíguo (sem udate), hash do payload todo
  if (!updateMarker) {
    const sorted = Object.keys(body).sort().map(k => `${k}=${body[k]}`).join('&')
    return await sha256(`${base}|${sorted.substring(0, 1000)}`)
  }
  return await sha256(base)
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startedAt = Date.now()

  try {
    const body = await parseBody(req)
    const { event_type, entity_type, entity_id } = classify(body)

    // Eventos sem entity_id (auth, automation, etc) — ignora silenciosamente
    if (!entity_id || entity_type === 'other') {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_entity_id_or_unknown_type', event_type }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const dedup_key = await generateDedupKey(event_type, entity_type, entity_id, body)

    // Insert idempotente (ON CONFLICT DO NOTHING via RPC)
    const { data: insertedId, error: insertErr } = await supabase.rpc('ac_event_raw_insert', {
      p_event_type: event_type,
      p_entity_type: entity_type,
      p_entity_id: entity_id,
      p_dedup_key: dedup_key,
      p_payload: body,
    })

    if (insertErr) {
      console.error('ac_event_raw_insert failed:', insertErr.message)
      // Retorna 200 mesmo assim — AC não deve fazer retry de erros nossos.
      // Log do erro fica nas logs do Supabase pra investigação.
      return new Response(JSON.stringify({ ok: false, error: insertErr.message, dedup_key }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isDuplicate = insertedId === null  // ON CONFLICT DO NOTHING = NULL
    const eventId = insertedId

    // Fire-and-forget: dispatcha sync incremental se for deal
    // Não aguarda — AC precisa de resposta rápida (< 5s).
    if (!isDuplicate && entity_type === 'deal') {
      const dispatchUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ww-ac-funnel-sync-incremental`
      fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ deal_id: entity_id, event_id: eventId, source: 'webhook' }),
      }).catch(e => console.warn(`dispatch to sync-incremental failed (deal ${entity_id}):`, (e as Error).message))
    }

    return new Response(JSON.stringify({
      ok: true,
      duplicate: isDuplicate,
      event_id: eventId,
      event_type, entity_type, entity_id,
      duration_ms: Date.now() - startedAt,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('webhook receiver failed:', msg)
    // Sempre 200 pra AC — erros nossos não devem disparar retry storm do AC.
    return new Response(JSON.stringify({ ok: false, error: msg, duration_ms: Date.now() - startedAt }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
