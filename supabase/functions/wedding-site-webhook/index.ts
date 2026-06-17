import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createWeddingLead,
  isCreateEnabled,
  type WeddingLead,
} from "../_shared/wedding-lead.ts";

// Webhook do FORMULÁRIO DO SITE welcomeweddings.com.br — segunda fonte de leads
// de WEDDING (a 1ª é o Leadster). Mesma tabela de auditoria (leadster_webhook_events,
// prefixo "site:"), mesmo núcleo de criação (createWeddingLead), origem='site'.
//
// Diferenças em relação ao Leadster:
//   - SEM assinatura/segredo (fonte pública) → aceita e só registra.
//   - Payload com campos numerados field[N] (form builder), não rótulos legíveis.

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

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  // O form manda "empty" literal pra campos não preenchidos.
  if (!s.length || s.toLowerCase() === "empty") return null;
  return s;
};

const pick = (p: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    if (k in p) {
      const v = str(p[k]);
      if (v) return v;
    }
  }
  return null;
};

// De-para dos campos do formulário do site → WeddingLead.
// Os field[N] são ids do form builder. Confirmados com a 1ª submissão de teste:
//   field[11]  = Onde Casar (destino)   ex.: "Portugal"
//   field[185] = nº de convidados        ex.: "Entre 80 a 100 Convidados"
//   field[81], field[12] = AINDA NÃO CONFIRMADOS → ficam crus em marketing_data
//   (orçamento/data do casamento? resolver com 1º payload real). Nada se perde.
const FIELD_DESTINO = "field[11]";
const FIELD_CONVIDADOS = "field[185]";

// Normaliza o payload do formulário do site para o WeddingLead comum.
function normalizeSitePayload(p: Record<string, unknown>): WeddingLead {
  const nome = pick(p, "fullname", "nome", "name");
  const email = pick(p, "email", "Email");
  const telefone = pick(p, "phone", "telefone", "Telefone");

  // marketing_data = tudo do payload exceto os campos core (nome/email/telefone).
  // Preserva field[N], url_referencia, data_hora_conversao crus (auditoria + de-para futuro).
  const coreKeys = ["fullname", "nome", "name", "email", "Email", "phone", "telefone", "Telefone"];
  const marketing: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (coreKeys.includes(k)) continue;
    marketing[k] = v;
  }

  return {
    nome,
    email,
    telefone,
    destino: pick(p, FIELD_DESTINO),
    convidados: pick(p, FIELD_CONVIDADOS),
    orcamentoFaixa: null, // campo de orçamento do site ainda não mapeado
    cidade: null,
    nomeNoivos: null, // formulário do site não captura o 2º noivo(a)
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
        // Fallback: formato "chave:valor" por linha (como o form de teste mandou).
        const parsed: Record<string, unknown> = {};
        for (const line of text.split(/\r?\n/)) {
          const idx = line.indexOf(":");
          if (idx > 0) parsed[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
        payload = Object.keys(parsed).length ? parsed : { raw: text };
      }
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const p = payload as Record<string, unknown>;
    const rawEventType = p.event ?? p.event_type ?? p.type ?? null;
    // Prefixo "site:" pra distinguir das linhas de Leadster (prefixo "wedding:")
    // na mesma tabela leadster_webhook_events.
    const eventType = rawEventType != null ? `site:${rawEventType}` : "site";

    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Grava sempre o evento cru (auditoria). Fonte sem assinatura → signature_valid null.
    const { data: evt, error } = await supabase
      .from("leadster_webhook_events")
      .insert({
        payload,
        headers,
        event_type: eventType,
        source_ip: sourceIp,
        signature_valid: null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[wedding-site-webhook] insert failed", error);
    }

    // Processa o lead. Interruptor próprio (site_create_cards), independente do Leadster.
    // Default (off) = modo ensaio: só calcula e loga o que faria, sem criar nada.
    const createEnabled = await isCreateEnabled(supabase, "site_create_cards");
    try {
      const lead = normalizeSitePayload(p);
      const { plan, createdCardId } = await createWeddingLead(supabase, lead, {
        createEnabled,
        origem: "site",
        fallbackName: "Lead Site",
      });
      console.log(`[wedding-site-webhook] ${plan}`);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ processed_at: new Date().toISOString(), process_error: plan, created_card_id: createdCardId })
          .eq("id", evt.id);
      }
    } catch (procErr) {
      console.error("[wedding-site-webhook] processing error", procErr);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ process_error: `EXCEPTION: ${procErr instanceof Error ? procErr.message : String(procErr)}` })
          .eq("id", evt.id);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[wedding-site-webhook] unexpected error", err);
    return jsonResponse({ ok: true });
  }
});
