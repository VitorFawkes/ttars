import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * nps-webhook — ingestão crua de respostas de NPS (Welcome Trips).
 *
 * Endpoint público (verify_jwt = false):
 *   POST https://<proj>.supabase.co/functions/v1/nps-webhook?source=typeform
 *
 * Estratégia "raw-first": aceita qualquer payload (JSON ou form-urlencoded),
 * guarda tudo cru em `nps_webhook_events` (status='pending') e responde 200
 * rápido. A transformação para nps_surveys/nps_responses (matching com
 * card/contato) é uma fase posterior que lê as linhas pendentes desta tabela.
 *
 * GET → 200 health check (pra abrir no navegador e confirmar que está no ar).
 *
 * Segurança opcional: se a env NPS_WEBHOOK_SECRET estiver setada, exige
 * ?key=<secret> (mismatch → 401). Sem a env, o link funciona aberto.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, x-idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Trips-only (mesma constante do leadster-webhook).
const TRIPS_CARD_ORG_ID = "b0000000-0000-0000-0000-000000000001"; // workspace Welcome Trips

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

// Extrai um valor aninhado tipo "form_response.token" de um objeto.
const deepGet = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({ ok: true, msg: "nps-webhook live" });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    // ---- Segurança opcional via secret ----
    const url = new URL(req.url);
    const secret = Deno.env.get("NPS_WEBHOOK_SECRET");
    if (secret && url.searchParams.get("key") !== secret) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const source = url.searchParams.get("source") ?? "unknown";
    const contentType = req.headers.get("content-type") ?? "";

    // ---- Parse tolerante (JSON ou form-urlencoded; fallback texto cru) ----
    let payload: Record<string, unknown>;
    try {
      if (contentType.includes("application/json")) {
        payload = await req.json();
      } else {
        const text = await req.text();
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          payload = JSON.parse(text);
        } else if (text.length) {
          payload = Object.fromEntries(new URLSearchParams(text));
        } else {
          payload = {};
        }
      }
    } catch (_parseErr) {
      const raw = await req.text().catch(() => "");
      payload = { _raw: raw, _parse_error: true };
    }
    // Garante que payload é objeto (arrays/escalares viram wrapper).
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
      payload = { _value: payload };
    }

    const headers = Object.fromEntries(req.headers.entries());
    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    // ---- Idempotência (best-effort) ----
    const idempotencyKey =
      str(headers["idempotency-key"]) ??
      str(headers["x-idempotency-key"]) ??
      str(deepGet(payload, "event_id")) ??
      str(deepGet(payload, "id")) ??
      str(deepGet(payload, "form_response.token"));

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("nps_webhook_events")
        .select("id")
        .eq("org_id", TRIPS_CARD_ORG_ID)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        console.log(`nps-webhook: duplicate ignored (${idempotencyKey})`);
        return jsonResponse({ ok: true, duplicate: true });
      }
    }

    // ---- Persistência crua ----
    const { data: inserted, error: insertErr } = await supabase
      .from("nps_webhook_events")
      .insert({
        org_id: TRIPS_CARD_ORG_ID,
        source,
        content_type: contentType || null,
        payload,
        headers,
        source_ip: sourceIp,
        idempotency_key: idempotencyKey,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr) {
      // Não derruba a ferramenta externa — loga e responde 200.
      console.error("nps-webhook insert error:", insertErr);
      return jsonResponse({ ok: true, stored: false });
    }

    console.log(`nps-webhook: stored event ${inserted?.id} (source=${source})`);
    return jsonResponse({ ok: true, stored: true, id: inserted?.id }, 202);
  } catch (err) {
    console.error("nps-webhook error:", err);
    // Sempre 200 pra não disparar retries agressivos da ferramenta externa.
    return jsonResponse({ ok: true, stored: false });
  }
});
