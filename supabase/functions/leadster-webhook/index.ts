import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Verifica um JWT HS256 (assinado com o secret do Leadster).
 * Retorna { valid, claims } — claims = payload decodificado (pra inspeção), ou null.
 * Não lança: qualquer erro de formato vira { valid: false }.
 */
async function verifyJwtHs256(
  token: string | null,
  secret: string,
): Promise<{ valid: boolean; claims: Record<string, unknown> | null }> {
  if (!token) return { valid: false, claims: null };

  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, claims: null };
  const [headerB64, payloadB64, sigB64] = parts;

  const b64urlToBytes = (s: string): Uint8Array => {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  // Decodifica claims (best-effort, só pra log)
  let claims: Record<string, unknown> | null = null;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    claims = null;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sigB64),
      encoder.encode(`${headerB64}.${payloadB64}`),
    );
    return { valid: ok, claims };
  } catch {
    return { valid: false, claims };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let payload: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      payload = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      payload = Object.fromEntries(new URLSearchParams(text));
    } else {
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const p = payload as Record<string, unknown>;
    const rawEventType = p.event ?? p.event_type ?? p.type ?? null;
    const eventType = rawEventType != null ? String(rawEventType) : null;

    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // --- Verificação de assinatura (JWT HS256 assinado com o secret do Leadster) ---
    // O Leadster manda o JWT no header Authorization (geralmente "Bearer <jwt>").
    // Fase de inspeção: verificamos e logamos, mas NÃO rejeitamos ainda — quando
    // confirmarmos que os webhooks reais batem, trocar o `if (!valid)` por um 401.
    const secret = Deno.env.get("LEADSTER_WEBHOOK_SECRET") ?? "";
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() || null;
    let signatureValid: boolean | null = null;
    if (secret) {
      const { valid } = await verifyJwtHs256(token, secret);
      signatureValid = valid;
      if (!valid) {
        console.warn(
          "[leadster-webhook] assinatura inválida/ausente (apenas logando, não rejeitando)",
        );
      }
    } else {
      console.warn("[leadster-webhook] LEADSTER_WEBHOOK_SECRET não configurado — sem verificação");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("leadster_webhook_events").insert({
      payload,
      headers,
      event_type: eventType,
      source_ip: sourceIp,
      signature_valid: signatureValid,
    });

    if (error) {
      console.error("[leadster-webhook] insert failed", error);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[leadster-webhook] unexpected error", err);
    return jsonResponse({ ok: true });
  }
});
