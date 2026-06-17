// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Calendly inbound webhook receiver.
 * Endpoint público (verify_jwt=false) — Calendly chama em invitee.created / invitee.canceled.
 *
 * Comportamento: SÓ EVENTO BRUTO.
 *  - Valida HMAC
 *  - Persiste log em calendly_webhook_events
 *  - Tenta resolver contato/card por email/telefone (apenas pra popular o log)
 *  - NÃO cria tarefa, NÃO move card
 *
 * A reação ao evento (criar tarefa, mover card, criar card novo, mandar mensagem, etc.)
 * é responsabilidade de automações configuradas pelo usuário no Workflow Editor.
 * Disparadas pelo trigger SQL trg_cadence_entry_on_calendly_invitee.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, calendly-webhook-signature",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validateSignature(
  signatureHeader: string | null,
  rawBody: string,
  signingKey: string,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",");
  let timestamp = "";
  let signature = "";
  for (const p of parts) {
    const [k, v] = p.split("=").map((s) => s.trim());
    if (k === "t") timestamp = v;
    if (k === "v1") signature = v;
  }
  if (!timestamp || !signature) return false;

  const data = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

interface CalendlyPayload {
  event?: string;
  payload?: {
    uri?: string;
    event?: {
      uri?: string;
      start_time?: string;
      end_time?: string;
      name?: string;
      location?: { type?: string; join_url?: string; location?: string };
    };
    event_type?: { name?: string; duration?: number };
    scheduled_event?: {
      uri?: string;
      start_time?: string;
      end_time?: string;
      name?: string;
      location?: { type?: string; join_url?: string; location?: string };
      event_memberships?: Array<{ user_email?: string }>;
    };
    email?: string;
    name?: string;
    questions_and_answers?: Array<{ question?: string; answer?: string }>;
    cancellation?: { reason?: string; canceled_by?: string };
    text_reminder_number?: string;
  };
}

function extractFromPayload(body: CalendlyPayload) {
  const inner = body.payload || {};
  const scheduled = inner.scheduled_event || inner.event || {};
  const loc = scheduled.location || {};

  const inviteeUri = inner.uri || "";
  const eventUuid = inviteeUri.split("/").pop() || null;

  const qa = inner.questions_and_answers || [];
  let phone: string | null = inner.text_reminder_number || null;
  if (!phone) {
    for (const q of qa) {
      const qText = (q.question || "").toLowerCase();
      if (qText.includes("telefone") || qText.includes("phone") || qText.includes("whatsapp") || qText.includes("celular")) {
        phone = q.answer || null;
        break;
      }
    }
  }

  const organizerEmail = scheduled.event_memberships?.[0]?.user_email || null;

  return {
    event_uuid: eventUuid,
    event_type: body.event || null,
    invitee_email: inner.email || null,
    invitee_name: inner.name || null,
    invitee_phone: phone,
    event_start_time: scheduled.start_time || null,
    event_end_time: scheduled.end_time || null,
    event_uri: scheduled.uri || null,
    event_name: scheduled.name || inner.event_type?.name || null,
    meeting_location_type: loc.type || null,
    meeting_join_url: loc.join_url || loc.location || null,
    organizer_email: organizerEmail,
  };
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "Could not read body" }, 400);
  }

  // Parse + extract primeiro: precisamos do organizer_email pra rotear a org.
  let body: CalendlyPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const extracted = extractFromPayload(body);
  if (!extracted.event_type) {
    return jsonResponse({ error: "Missing event type" }, 400);
  }

  const signatureHeader = req.headers.get("calendly-webhook-signature");
  const orgDefault = Deno.env.get("CALENDLY_ORG_DEFAULT") || "b0000000-0000-0000-0000-000000000001";
  const orgWeddings = Deno.env.get("CALENDLY_ORG_WEDDINGS") || "b0000000-0000-0000-0000-000000000002";

  // Roteamento da org de origem pelo DOMÍNIO do organizer. As contas Calendly de
  // Weddings (contato@ / weddingplanner@welcomeweddings.com.br) não emitem signing
  // key, então são roteadas pelo e-mail do organizer e aceitas sem HMAC. Trips
  // valida HMAC normalmente (CALENDLY_SIGNING_KEY). source_org_id é usado pelo
  // trigger SQL pra rodar só os gatilhos da org certa (evita card fantasma cross-org).
  const weddingsDomains = (Deno.env.get("CALENDLY_WEDDINGS_ORGANIZER_DOMAINS") || "welcomeweddings.com.br")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const organizer = (extracted.organizer_email || "").toLowerCase();
  const isWeddings = weddingsDomains.some((d) => organizer.endsWith("@" + d) || organizer.endsWith("." + d));
  const sourceOrgId = isWeddings ? orgWeddings : orgDefault;

  // Valida HMAC contra as chaves configuradas (Trips + Weddings, se algum dia existir).
  const signingKeys = [
    Deno.env.get("CALENDLY_SIGNING_KEY") || "",
    Deno.env.get("CALENDLY_SIGNING_KEY_WEDDINGS_SDR") || "",
    Deno.env.get("CALENDLY_SIGNING_KEY_WEDDINGS_CLOSER") || "",
    Deno.env.get("CALENDLY_SIGNING_KEY_WEDDINGS") || "",
  ].filter(Boolean);
  let signatureValid: boolean | null = null;
  if (signingKeys.length > 0 && signatureHeader) {
    signatureValid = false;
    for (const k of signingKeys) {
      if (await validateSignature(signatureHeader, rawBody, k)) { signatureValid = true; break; }
    }
  }
  // Trips DEVE ter assinatura válida; Weddings é aceito sem (conta sem signing key).
  if (!isWeddings && signingKeys.length > 0 && signatureValid !== true) {
    console.warn("[calendly-webhook] Trips event with invalid/missing signature — rejecting");
    return jsonResponse({ error: "Invalid signature" }, 401);
  }
  if (isWeddings && signatureValid !== true) {
    console.warn("[calendly-webhook] Weddings event accepted without HMAC (conta sem signing key)");
  }

  if (extracted.event_uuid) {
    const { data: existing } = await supabase
      .from("calendly_webhook_events")
      .select("id, processed_status")
      .eq("event_uuid", extracted.event_uuid)
      .maybeSingle();
    if (existing) {
      console.log("[calendly-webhook] Duplicate, ignoring:", extracted.event_uuid);
      return jsonResponse({ message: "Duplicate", id: existing.id }, 200);
    }
  }

  const { data: logRow, error: logErr } = await supabase
    .from("calendly_webhook_events")
    .insert({
      event_uuid: extracted.event_uuid,
      event_type: extracted.event_type,
      payload: body,
      signature_header: signatureHeader,
      signature_valid: signatureValid,
      invitee_email: extracted.invitee_email,
      invitee_name: extracted.invitee_name,
      invitee_phone: extracted.invitee_phone,
      event_start_time: extracted.event_start_time,
      event_end_time: extracted.event_end_time,
      event_uri: extracted.event_uri,
      event_name: extracted.event_name,
      meeting_location_type: extracted.meeting_location_type,
      meeting_join_url: extracted.meeting_join_url,
      organizer_email: extracted.organizer_email,
      source_org_id: sourceOrgId,
      processed_status: "pending",
    })
    .select("id")
    .single();

  if (logErr) {
    console.error("[calendly-webhook] Failed to log event:", logErr);
    return jsonResponse({ error: "Persistence failed" }, 500);
  }

  const logId = logRow.id;

  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(matchContactAndCard(supabase, logId, extracted));

  return jsonResponse({ ok: true, id: logId }, 200);
});

/**
 * Tenta resolver contato/card por email/telefone e atualiza o log.
 * NÃO cria nada — apenas popula os campos pra que o trigger SQL
 * (process_cadence_entry_on_calendly_invitee) decida se cria/move/etc
 * conforme a config das automações ativas.
 */
async function matchContactAndCard(
  supabase: any,
  logId: string,
  ex: ReturnType<typeof extractFromPayload>,
) {
  try {
    let contatoId: string | null = null;
    let orgId: string | null = null;

    if (ex.invitee_email) {
      const { data: byEmail } = await supabase
        .from("contatos")
        .select("id, org_id")
        .ilike("email", ex.invitee_email)
        .limit(1)
        .maybeSingle();
      if (byEmail) {
        contatoId = byEmail.id;
        orgId = byEmail.org_id;
      }
    }

    if (!contatoId && ex.invitee_phone) {
      const phoneDigits = normalizePhone(ex.invitee_phone);
      if (phoneDigits && phoneDigits.length >= 9) {
        const { data: byPhone } = await supabase
          .from("contatos")
          .select("id, org_id")
          .ilike("telefone", `%${phoneDigits.slice(-9)}%`)
          .limit(1)
          .maybeSingle();
        if (byPhone) {
          contatoId = byPhone.id;
          orgId = byPhone.org_id;
        }
      }
    }

    let cardId: string | null = null;
    let cardOrgId: string | null = null;
    if (contatoId) {
      const { data: card } = await supabase
        .from("cards")
        .select("id, org_id")
        .eq("pessoa_principal_id", contatoId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (card) {
        cardId = card.id;
        cardOrgId = card.org_id;
      }
    }

    await supabase
      .from("calendly_webhook_events")
      .update({
        processed_status: "success",
        processed_at: new Date().toISOString(),
        contato_id: contatoId,
        card_id: cardId,
        org_id: cardOrgId || orgId,
      })
      .eq("id", logId);

    console.log(
      `[calendly-webhook] Logged ${ex.event_type}: contato_id=${contatoId} card_id=${cardId}`,
    );
  } catch (err: any) {
    console.error("[calendly-webhook] Match error:", err);
    await supabase
      .from("calendly_webhook_events")
      .update({
        processed_status: "error",
        processed_at: new Date().toISOString(),
        error_message: String(err?.message || err),
      })
      .eq("id", logId);
  }
}
