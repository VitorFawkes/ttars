// email-inbound — recebe e-mails de FORA e faz eles caírem na página do casamento.
//
// Fluxo (D-P6, 2ª forma — "e-mail-código"):
//   1. O provedor de e-mail (Resend Inbound, ou qualquer um que poste JSON)
//      manda o e-mail recebido pra cá.
//   2. Resolvemos o card:
//      a) pelo e-mail-código em QUALQUER destinatário: casamento+<id>@…
//         (id = uuid do card, com ou sem traços) — também aceita card+<id>@…;
//      b) fallback: pelo e-mail do remetente (contato do casal → card WEDDING
//         aberto mais recente).
//   3. INSERT em `mensagens` (canal='email', lado='in') → a seção "E-mail com o
//      casal" já renderiza, e o trigger log_mensagem_activity loga na timeline.
//
// Segurança: verify_jwt=false (webhook externo). Se RESEND_INBOUND_SECRET
// estiver setado, valida a assinatura svix do Resend; sem ele, aceita (fase de
// teste). Só grava quando resolve um card válido.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_SECRET = Deno.env.get("RESEND_INBOUND_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Assinatura svix (Resend webhooks) — opcional ─────────────────────────────
async function verifySvix(req: Request, payload: string): Promise<boolean> {
  if (!INBOUND_SECRET) return true; // sem secret configurado → aceita (teste)
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  const sig = req.headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  try {
    const secretRaw = INBOUND_SECRET.startsWith("whsec_") ? INBOUND_SECRET.slice(6) : INBOUND_SECRET;
    const key = Uint8Array.from(atob(secretRaw), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const data = new TextEncoder().encode(`${id}.${ts}.${payload}`);
    const mac = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return sig.split(" ").some((part) => part.split(",")[1] === expected);
  } catch {
    return false;
  }
}

// ── Parse tolerante: Resend inbound OU JSON genérico ────────────────────────
interface ParsedEmail {
  from: string;
  recipients: string[]; // to + cc
  subject: string;
  text: string;
  messageId: string | null;
  inReplyTo: string | null;
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// deno-lint-ignore no-explicit-any
function parseEmail(payload: any): ParsedEmail | null {
  // Resend inbound: { type: 'email.received'|..., data: {...} } — ou o objeto direto
  const d = payload?.data ?? payload;
  if (!d || typeof d !== "object") return null;

  const from: string = typeof d.from === "string" ? d.from : d.from?.email ?? d.sender ?? "";
  const recipients = [...asArray(d.to), ...asArray(d.cc), ...asArray(d.bcc)];
  const subject: string = d.subject ?? "";
  const text: string = d.text ?? (d.html ? stripHtml(String(d.html)) : "");
  const headers = d.headers ?? {};
  const header = (name: string): string | null => {
    if (Array.isArray(headers)) {
      const h = headers.find((x: { name?: string }) => x?.name?.toLowerCase() === name);
      return h?.value ?? null;
    }
    return headers[name] ?? headers[name.replace(/(^|-)\w/g, (m: string) => m.toUpperCase())] ?? null;
  };

  if (!from && recipients.length === 0) return null;
  return {
    from,
    recipients,
    subject,
    text,
    messageId: d.message_id ?? d.messageId ?? header("message-id"),
    inReplyTo: d.in_reply_to ?? header("in-reply-to"),
  };
}

function extractEmailAddress(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

// e-mail-código: casamento+<uuid|hex32>@… (aceita card+ também)
function cardIdFromRecipients(recipients: string[]): string | null {
  for (const r of recipients) {
    const addr = extractEmailAddress(r);
    const m = addr.match(/^(?:casamento|card)\+([0-9a-f-]{32,36})@/i);
    if (!m) continue;
    const raw = m[1].replace(/-/g, "");
    if (raw.length !== 32) continue;
    return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  }
  return null;
}

// Fallback: remetente é contato do casal → card WEDDING aberto mais recente
async function cardIdFromSender(fromEmail: string): Promise<string | null> {
  if (!fromEmail) return null;
  const { data: contatos } = await supabase
    .from("contatos")
    .select("id")
    .ilike("email", fromEmail)
    .limit(5);
  if (!contatos?.length) return null;
  const ids = contatos.map((c: { id: string }) => c.id);

  const { data: byPrincipal } = await supabase
    .from("cards")
    .select("id, created_at")
    .in("pessoa_principal_id", ids)
    .eq("produto", "WEDDING")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (byPrincipal?.length) return byPrincipal[0].id;

  const { data: vinculos } = await supabase
    .from("cards_contatos")
    .select("card_id, cards!inner(id, produto, archived_at, created_at)")
    .in("contato_id", ids)
    .limit(20);
  const abertos = (vinculos ?? [])
    // deno-lint-ignore no-explicit-any
    .map((v: any) => v.cards)
    // deno-lint-ignore no-explicit-any
    .filter((c: any) => c && c.produto === "WEDDING" && !c.archived_at)
    // deno-lint-ignore no-explicit-any
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  return abertos[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const raw = await req.text();
  if (!(await verifySvix(req, raw))) return json(401, { error: "invalid signature" });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid json" });
  }

  const email = parseEmail(payload);
  if (!email) return json(200, { ok: true, skipped: "unparseable payload" });

  const fromEmail = extractEmailAddress(email.from);
  let cardId = cardIdFromRecipients(email.recipients);
  let via = "email_codigo";
  if (!cardId) {
    cardId = await cardIdFromSender(fromEmail);
    via = "sender_match";
  }
  if (!cardId) {
    console.log(`[email-inbound] sem card: from=${fromEmail} to=${email.recipients.join(";")}`);
    return json(200, { ok: true, skipped: "card não resolvido" });
  }

  // org do card (insert via service_role: org_id vai explícito)
  const { data: card, error: cardErr } = await supabase
    .from("cards")
    .select("id, org_id")
    .eq("id", cardId)
    .maybeSingle();
  if (cardErr || !card) return json(200, { ok: true, skipped: "card não encontrado" });

  // dedupe por Message-ID (reentrega do webhook)
  if (email.messageId) {
    const { data: dup } = await supabase
      .from("mensagens")
      .select("id")
      .eq("card_id", card.id)
      .eq("canal", "email")
      .contains("metadados", { message_id: email.messageId })
      .limit(1);
    if (dup?.length) return json(200, { ok: true, skipped: "duplicado" });
  }

  const { error: insErr } = await supabase.from("mensagens").insert({
    card_id: card.id,
    org_id: card.org_id,
    lado: "in",
    canal: "email",
    assunto: email.subject || null,
    conteudo: email.text || "(sem corpo)",
    metadados: {
      from: fromEmail,
      to: email.recipients,
      message_id: email.messageId,
      in_reply_to: email.inReplyTo,
      via,
    },
  });
  if (insErr) {
    console.error(`[email-inbound] insert falhou: ${insErr.message}`);
    return json(500, { error: insErr.message });
  }

  console.log(`[email-inbound] ok card=${card.id} via=${via} from=${fromEmail}`);
  return json(200, { ok: true, card_id: card.id, via });
});
