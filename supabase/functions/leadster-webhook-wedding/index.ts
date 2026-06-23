import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createWeddingLead,
  isCreateEnabled,
  type WeddingLead,
} from "../_shared/wedding-lead.ts";

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

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

// Lê um campo do payload tolerando algumas variações de label.
const pick = (p: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    if (k in p) {
      const v = str(p[k]);
      if (v) return v;
    }
  }
  return null;
};

// O form do Leadster manda faixas de orçamento por extenso; o campo
// ww_orcamento_faixa tem opções fixas (Até R$50k, R$50-80k, ...).
const ORCAMENTO_FORM_PARA_FAIXA: Record<string, string> = {
  "Até R$50 mil": "Até R$50k",
  "Entre R$50 e R$80 mil": "R$50-80k",
  "Entre R$80 e R$100 mil": "R$80-100k",
  "Entre R$100 e R$200 mil": "R$100-200k",
  "Entre R$200 e R$500 mil": "Acima R$200k",
  "Mais de R$500 mil": "Acima R$200k",
};

// Normaliza o payload do Leadster (rótulos legíveis) para o WeddingLead comum.
function normalizeLeadsterPayload(p: Record<string, unknown>): WeddingLead {
  const qInvestimento = pick(p, "Investimento 2");
  const orcamentoFaixa = qInvestimento ? (ORCAMENTO_FORM_PARA_FAIXA[qInvestimento] ?? null) : null;

  // marketing_data = tudo do payload exceto core + jwt.
  const marketing: Record<string, unknown> = {};
  const coreKeys = ["Nome", "nome", "name", "Email", "email", "Telefone", "telefone", "phone", "jwt"];
  for (const [k, v] of Object.entries(p)) {
    if (coreKeys.includes(k)) continue;
    marketing[k] = v;
  }

  return {
    nome: pick(p, "Nome", "nome", "name"),
    email: pick(p, "Email", "email"),
    telefone: pick(p, "Telefone", "telefone", "phone"),
    destino: pick(p, "Onde Casar", "Destino"),
    convidados: pick(p, "Convidados 2"),
    orcamentoFaixa,
    cidade: pick(p, "Cidade"),
    nomeNoivos: pick(p, "Nome dos noivos", "nome_dos_noivos"),
    marketing,
  };
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
    // Marcador "wedding" no event_type pra distinguir das linhas de Trips
    // na mesma tabela leadster_webhook_events.
    const eventType = rawEventType != null ? `wedding:${rawEventType}` : "wedding";

    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // --- Verificação de assinatura (JWT HS256 assinado com o secret do Leadster) ---
    // O Leadster manda o JWT DENTRO do corpo, no campo "jwt" (não no header).
    // Mantém o header Authorization como fallback por garantia.
    // Fase de inspeção: verificamos e logamos, mas NÃO rejeitamos ainda — quando
    // confirmarmos que os webhooks reais batem, trocar o `if (!valid)` por um 401.
    const secret = Deno.env.get("LEADSTER_WEBHOOK_SECRET") ?? "";
    const bodyJwt = typeof p.jwt === "string" ? p.jwt : null;
    const authHeader = req.headers.get("authorization");
    const headerJwt = authHeader?.replace(/^Bearer\s+/i, "").trim() || null;
    const token = bodyJwt ?? headerJwt;
    let signatureValid: boolean | null = null;
    if (secret) {
      const { valid } = await verifyJwtHs256(token, secret);
      signatureValid = valid;
      if (!valid) {
        console.warn(
          "[leadster-webhook-wedding] assinatura inválida/ausente (apenas logando, não rejeitando)",
        );
      }
    } else {
      console.warn("[leadster-webhook-wedding] LEADSTER_WEBHOOK_SECRET não configurado — sem verificação");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Grava sempre o evento cru (auditoria), capturando o id pra anotar o resultado depois.
    const { data: evt, error } = await supabase
      .from("leadster_webhook_events")
      .insert({
        payload,
        headers,
        event_type: eventType,
        source_ip: sourceIp,
        signature_valid: signatureValid,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[leadster-webhook-wedding] insert failed", error);
    }

    // Processa o lead. Interruptor lido de integration_settings (workspace Weddings).
    // Default (off) = modo ensaio: só calcula e loga o que faria, sem criar nada.
    // Garantia anti-duplicação: ligar este flag e desligar a entrada pelo ActiveCampaign
    // de Weddings devem ser feitos juntos.
    const createEnabled = await isCreateEnabled(supabase, "leadster_create_cards");
    try {
      const lead = normalizeLeadsterPayload(p);
      const { plan, createdCardId } = await createWeddingLead(supabase, lead, {
        createEnabled,
        origem: "leadster",
        fallbackName: "Lead Leadster",
      });
      console.log(`[leadster-webhook-wedding] ${plan}`);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ processed_at: new Date().toISOString(), process_error: plan, created_card_id: createdCardId })
          .eq("id", evt.id);
      }
    } catch (procErr) {
      console.error("[leadster-webhook-wedding] processing error", procErr);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ process_error: `EXCEPTION: ${procErr instanceof Error ? procErr.message : String(procErr)}` })
          .eq("id", evt.id);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[leadster-webhook-wedding] unexpected error", err);
    return jsonResponse({ ok: true });
  }
});
