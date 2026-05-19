/**
 * send-echo-template — dispara um template HSM da Meta via Echo, em batch.
 *
 * Usado pela aba "Envios do Dia" do CRM. Pra cada convidado da lista, faz
 * POST /send-template no Echo com `body_parameters` resolvido a partir do
 * mapping var→campo + dados do contato/casamento.
 *
 * Limite: até 50 destinatários por request. Acima disso, o caller divide.
 *
 * Após envio bem-sucedido, registra em whatsapp_messages com card_id e
 * contact_id — necessário pro trigger trg_handle_guest_rsvp_response
 * conseguir achar qual casamento a resposta "Não vou ao evento" se refere.
 *
 * POST /functions/v1/send-echo-template
 * Headers: Authorization: Bearer <JWT>
 *
 * Body:
 *   {
 *     "template_name": "promom1",
 *     "language": "pt_BR",
 *     "phone_number_id": "uuid-echo",
 *     "card_id": "uuid",                     // do casamento
 *     "org_id": "uuid",                       // welcome-weddings
 *     "recipients": [
 *       {
 *         "to": "5511999999999",
 *         "contact_id": "uuid",               // pra rastrear no whatsapp_messages
 *         "body_parameters": ["João", "Resort X"],
 *         "button_parameters": ["abc"]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Resposta:
 *   {
 *     "sent": 8,
 *     "failed": 1,
 *     "results": [
 *       { "to": "...", "ok": true, "whatsapp_message_id": "wamid.xxx" },
 *       { "to": "...", "ok": false, "error": "phone number invalid" }
 *     ]
 *   }
 *
 * Env:
 *   - ECHO_API_URL  : base do Echo (ex: https://sueokszzizsxalfwyuav.supabase.co/functions/v1/echo-api)
 *   - ECHO_API_KEY  : x-api-key do Echo
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Recipient {
  to: string;
  contact_id?: string;
  body_parameters: string[];
  button_parameters?: string[];
}

interface Body {
  template_name: string;
  language?: string;
  phone_number_id: string;
  card_id?: string;
  org_id?: string;
  recipients: Recipient[];
}

interface SendResult {
  to: string;
  ok: boolean;
  whatsapp_message_id?: string;
  error?: string;
}

const MAX_RECIPIENTS = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body JSON inválido" }, 400);
  }

  if (!body.template_name || !body.phone_number_id || !Array.isArray(body.recipients)) {
    return jsonResponse({
      error: "template_name, phone_number_id e recipients são obrigatórios",
    }, 400);
  }

  if (body.recipients.length === 0) {
    return jsonResponse({ error: "recipients vazio" }, 400);
  }

  if (body.recipients.length > MAX_RECIPIENTS) {
    return jsonResponse({
      error: `Máximo ${MAX_RECIPIENTS} destinatários por request (recebi ${body.recipients.length})`,
    }, 400);
  }

  const echoApiUrl = Deno.env.get("ECHO_API_URL");
  const echoApiKey = Deno.env.get("ECHO_API_KEY");

  if (!echoApiUrl || !echoApiKey) {
    return jsonResponse({
      error: "ECHO_API_URL ou ECHO_API_KEY não configurado",
    }, 500);
  }

  // Cliente Supabase (service role) pra gravar em whatsapp_messages
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  // ECHO_API_URL pode vir apontando pra /echo-api/send-message (legado do
  // send-whatsapp-message). Stripa o sufixo pra obter a base correta.
  const echoBase = echoApiUrl.replace(/\/send-message\/?$/, "").replace(/\/+$/, "");
  const sendTemplateUrl = echoBase + "/send-template";
  const language = body.language || "pt_BR";

  // Cria o lote pra rastrear o disparo. Frontend monitora via realtime.
  let envioLoteId: string | null = null;
  if (supabase && body.card_id && body.org_id) {
    const { data: lote, error: loteErr } = await supabase
      .from("envio_lotes")
      .insert({
        org_id: body.org_id,
        card_id: body.card_id,
        template_slug: body.template_name,
        phone_number_id: body.phone_number_id,
        total: body.recipients.length,
        sent: 0,
        failed: 0,
        status: "enviando",
      })
      .select("id")
      .single();
    if (loteErr) {
      console.error(`[send-echo-template] falha ao criar envio_lote: ${loteErr.message}`);
    } else {
      envioLoteId = (lote as { id: string } | null)?.id ?? null;
    }
  }

  // Loop sequencial — Echo não tem batch, então cada destinatário vai num
  // request. Sequencial pra não estourar rate-limit e manter ordem do log.
  const results: SendResult[] = [];
  for (const r of body.recipients) {
    if (!r.to) {
      results.push({ to: "", ok: false, error: "phone vazio" });
      continue;
    }

    try {
      const echoPayload = {
        to: r.to,
        template_name: body.template_name,
        language_code: language,
        phone_number_id: body.phone_number_id,
        body_parameters: r.body_parameters || [],
        button_parameters: r.button_parameters || [],
      };

      const echoResp = await fetch(sendTemplateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": echoApiKey,
        },
        body: JSON.stringify(echoPayload),
      });

      const rawResponse = await echoResp.text();
      let echoJson: { whatsapp_message_id?: string; error?: string; message?: string } = {};
      try { echoJson = JSON.parse(rawResponse); } catch { /* response não-JSON */ }

      const success = echoResp.ok || !!echoJson.whatsapp_message_id;

      if (!success) {
        console.error(
          `[send-echo-template] HTTP ${echoResp.status} from Echo. Payload sent: ${JSON.stringify(echoPayload)}. Response: ${rawResponse.slice(0, 500)}`
        );
      }

      if (success) {
        results.push({
          to: r.to,
          ok: true,
          whatsapp_message_id: echoJson.whatsapp_message_id,
        });

        // Registra outbound em whatsapp_messages pra que o trigger consiga
        // achar o card_id quando vier a resposta "Não vou ao evento".
        // Falha aqui não é crítica — só log; o envio em si já foi.
        if (supabase && body.card_id && r.contact_id) {
          const { error: insErr } = await supabase
            .from("whatsapp_messages")
            .insert({
              org_id: body.org_id ?? null,
              card_id: body.card_id,
              contact_id: r.contact_id,
              direction: "outbound",
              message_type: "template",
              body: body.template_name,
              phone_number_id: body.phone_number_id,
              whatsapp_message_id: echoJson.whatsapp_message_id ?? null,
              origem: "send-echo-template",
              is_from_me: true,
              metadata: {
                template_name: body.template_name,
                language_code: language,
                body_parameters: r.body_parameters || [],
                button_parameters: r.button_parameters || [],
                envio_lote_id: envioLoteId,
              },
            });
          if (insErr) {
            console.error(`[send-echo-template] falha insert whatsapp_messages: ${insErr.message}`);
          }
        }
      } else {
        const errorMsg = echoJson.error || echoJson.message || `HTTP ${echoResp.status}: ${rawResponse.slice(0, 200)}`;
        results.push({ to: r.to, ok: false, error: errorMsg });

        // Registra falha em whatsapp_messages pra o relatório
        if (supabase && body.card_id && r.contact_id) {
          await supabase.from("whatsapp_messages").insert({
            org_id: body.org_id ?? null,
            card_id: body.card_id,
            contact_id: r.contact_id,
            direction: "outbound",
            message_type: "template",
            body: body.template_name,
            phone_number_id: body.phone_number_id,
            origem: "send-echo-template",
            is_from_me: true,
            has_error: true,
            error_message: errorMsg,
            metadata: {
              template_name: body.template_name,
              envio_lote_id: envioLoteId,
              echo_status: echoResp.status,
            },
          }).then(({ error }) => {
            if (error) console.error(`[send-echo-template] falha insert (failure row): ${error.message}`);
          });
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ to: r.to, ok: false, error: errorMsg });

      if (supabase && body.card_id && r.contact_id) {
        await supabase.from("whatsapp_messages").insert({
          org_id: body.org_id ?? null,
          card_id: body.card_id,
          contact_id: r.contact_id,
          direction: "outbound",
          message_type: "template",
          body: body.template_name,
          phone_number_id: body.phone_number_id,
          origem: "send-echo-template",
          is_from_me: true,
          has_error: true,
          error_message: errorMsg,
          metadata: { template_name: body.template_name, envio_lote_id: envioLoteId },
        }).then(({ error }) => {
          if (error) console.error(`[send-echo-template] falha insert (exception row): ${error.message}`);
        });
      }
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  // Marca lote como concluído
  if (supabase && envioLoteId) {
    const { error: updErr } = await supabase
      .from("envio_lotes")
      .update({
        sent,
        failed,
        status: "concluido",
        finished_at: new Date().toISOString(),
      })
      .eq("id", envioLoteId);
    if (updErr) {
      console.error(`[send-echo-template] falha update envio_lote: ${updErr.message}`);
    }
  }

  return jsonResponse({ sent, failed, results, envio_lote_id: envioLoteId }, 200);
});

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
