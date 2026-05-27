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

// ---- Constantes TRIPS (idênticas ao que o ActiveCampaign produz hoje) ----
const TRIPS_PIPELINE_ID = "c8022522-4a1d-411c-9387-efe03ca725ee"; // Pipeline Welcome Trips
const TRIPS_CARD_ORG_ID = "b0000000-0000-0000-0000-000000000001"; // workspace Welcome Trips (cards)
const SHARED_CONTACT_ORG_ID = "a0000000-0000-0000-0000-000000000001"; // conta Welcome Group (contatos compartilhados)

// deno-lint-ignore no-explicit-any
type SupaClient = any;

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

// Interruptor (configurável pela tela de Configurações → Leadster).
// Lê integration_settings(key='leadster_create_cards') da org Welcome Trips.
// Ausente/erro/'false' = modo ensaio (não cria nada). 'true' = cria de verdade.
async function isCreateEnabled(supabase: SupaClient): Promise<boolean> {
  const { data } = await supabase
    .from("integration_settings")
    .select("value")
    .eq("key", "leadster_create_cards")
    .eq("org_id", TRIPS_CARD_ORG_ID)
    .is("produto", null)
    .maybeSingle();
  return (str(data?.value) ?? "false").toLowerCase() === "true";
}

/**
 * Processa um lead do Leadster: dedup de contato e card, e (só quando
 * `createEnabled`) criação de verdade. Sem `createEnabled` é puro SELECT
 * (modo ensaio) — nenhuma linha é criada.
 *
 * Reusa o mesmo critério de dedup que public-api (Echo) e integration-process:
 *   contato por email → por telefone (find_contact_by_whatsapp);
 *   card por pessoa_principal_id + produto TRIPS + status aberto.
 */
async function processLeadsterLead(
  supabase: SupaClient,
  p: Record<string, unknown>,
  createEnabled: boolean,
): Promise<{ plan: string; createdCardId: string | null }> {
  const nome = pick(p, "Nome", "nome", "name");
  const email = pick(p, "Email", "email");
  const telefone = pick(p, "Telefone", "telefone", "phone");

  if (!email && !telefone) {
    return { plan: "ignorado: payload sem Email e sem Telefone (impossível dedup/criar)", createdCardId: null };
  }

  // --- 1. Dedup de contato (email → telefone) ---
  let contactId: string | null = null;
  let matchedBy: string | null = null;

  if (email) {
    const { data } = await supabase
      .from("contatos").select("id").eq("email", email).limit(1).maybeSingle();
    if (data?.id) { contactId = data.id; matchedBy = "email"; }
  }
  if (!contactId && telefone) {
    const { data: foundId } = await supabase
      .rpc("find_contact_by_whatsapp", { p_phone: telefone, p_convo_id: "" });
    if (foundId) { contactId = foundId as string; matchedBy = "telefone"; }
  }

  // --- 2. Dedup de card (só faz sentido se já existe contato) ---
  let existingCardId: string | null = null;
  if (contactId) {
    const { data: cards } = await supabase
      .from("cards")
      .select("id")
      .eq("pessoa_principal_id", contactId)
      .eq("produto", "TRIPS")
      .not("status_comercial", "in", '("ganho","perdido")')
      .is("deleted_at", null)
      .limit(1);
    existingCardId = cards?.[0]?.id ?? null;
  }

  // --- 3. Resolver primeira etapa do pipeline TRIPS (SELECT, ok em ensaio) ---
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_phases!inner(order_index)")
    .eq("pipeline_id", TRIPS_PIPELINE_ID)
    .order("pipeline_phases(order_index)", { ascending: true })
    .order("ordem", { ascending: true })
    .limit(1);
  const stageId: string | null = stages?.[0]?.id ?? null;

  // --- Plano legível (vale tanto pro ensaio quanto pro log de produção) ---
  const contatoPlan = contactId
    ? `contato existente ${contactId} (via ${matchedBy})`
    : "criaria contato novo (org Welcome Group)";
  const cardPlan = existingCardId
    ? `card TRIPS aberto já existe ${existingCardId} → DEDUP, não criaria`
    : "criaria card TRIPS novo";
  const planBase = `${contatoPlan}; ${cardPlan}`;

  // --- Modo ensaio: para por aqui, nada é criado ---
  if (!createEnabled) {
    return { plan: `ENSAIO (LEADSTER_CREATE_CARDS off): ${planBase}`, createdCardId: null };
  }

  // --- 4. Criação real ---
  // 4a. Card já existe → dedup, não cria nada.
  if (existingCardId) {
    return { plan: `DEDUP: card TRIPS aberto já existe ${existingCardId}`, createdCardId: existingCardId };
  }

  // 4b. Criar contato se necessário.
  if (!contactId) {
    const parts = (nome ?? "Lead Leadster").split(/\s+/);
    const { data: novo, error: cErr } = await supabase
      .from("contatos")
      .insert({
        org_id: SHARED_CONTACT_ORG_ID,
        nome: parts[0],
        sobrenome: parts.length > 1 ? parts.slice(1).join(" ") : null,
        email,
        telefone,
        tipo_pessoa: "adulto",
        origem: "leadster",
        tags: ["leadster"],
      })
      .select("id").single();
    if (cErr) return { plan: `ERRO ao criar contato: ${cErr.message}`, createdCardId: null };
    contactId = novo.id;
  }

  // 4c. marketing_data = tudo do payload exceto core + jwt.
  const marketing: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (["Nome", "nome", "name", "Email", "email", "Telefone", "telefone", "phone", "jwt"].includes(k)) continue;
    marketing[k] = v;
  }

  // 4d. Criar card TRIPS.
  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .insert({
      titulo: nome ?? "Lead Leadster",
      pessoa_principal_id: contactId,
      org_id: TRIPS_CARD_ORG_ID,
      pipeline_id: TRIPS_PIPELINE_ID,
      pipeline_stage_id: stageId,
      produto: "TRIPS",
      origem: "leadster",
      status_comercial: "aberto",
      moeda: "BRL",
      marketing_data: marketing,
    })
    .select("id").single();
  if (cardErr) return { plan: `ERRO ao criar card: ${cardErr.message}`, createdCardId: null };

  // 4e. Ligar contato ao card.
  await supabase.from("cards_contatos").insert({
    card_id: card.id,
    contato_id: contactId,
    tipo_viajante: "adulto",
    ordem: 0,
  });

  return { plan: `CRIADO card TRIPS ${card.id} (contato ${contactId})`, createdCardId: card.id };
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
      console.error("[leadster-webhook] insert failed", error);
    }

    // Processa o lead. Interruptor lido de integration_settings (tela de Configurações → Leadster).
    // Default (off) = modo ensaio: só calcula e loga o que faria, sem criar nada.
    // Garantia anti-duplicação: ligar este flag e desligar a criação pelo ActiveCampaign
    // devem ser feitos juntos.
    const createEnabled = await isCreateEnabled(supabase);
    try {
      const { plan, createdCardId } = await processLeadsterLead(supabase, p, createEnabled);
      console.log(`[leadster-webhook] ${plan}`);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ processed_at: new Date().toISOString(), process_error: plan, created_card_id: createdCardId })
          .eq("id", evt.id);
      }
    } catch (procErr) {
      console.error("[leadster-webhook] processing error", procErr);
      if (evt?.id) {
        await supabase
          .from("leadster_webhook_events")
          .update({ process_error: `EXCEPTION: ${procErr instanceof Error ? procErr.message : String(procErr)}` })
          .eq("id", evt.id);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[leadster-webhook] unexpected error", err);
    return jsonResponse({ ok: true });
  }
});
