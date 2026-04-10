/**
 * send-whatsapp-message — API REST universal para envio de WhatsApp via Echo.
 *
 * Chamável por: automacao-processor, n8n, CRM manual, qualquer API client.
 *
 * POST /functions/v1/send-whatsapp-message
 * Headers: Authorization: Bearer $SERVICE_ROLE_KEY (ou JWT autenticado)
 *
 * Body:
 *   {
 *     "contact_id": "uuid",           // OBRIGATÓRIO
 *     "card_id": "uuid",              // opcional (para contexto)
 *     "corpo": "texto da mensagem",   // OU template_id
 *     "template_id": "uuid",          // OU corpo direto
 *     "platform_id": "uuid",          // opcional (auto-resolve)
 *     "variables": {},                 // variáveis extras para template
 *     "source": "automacao|manual|n8n|api",
 *     "automacao_execucao_id": "uuid"  // opcional: link para tracking
 *   }
 *
 * Env vars:
 *   - ECHO_API_URL  : URL da API Echo (ex: https://xxx.supabase.co/functions/v1/echo-api/send-message)
 *   - ECHO_API_KEY  : API key do Echo
 *   - ECHO_PHONE_NUMBER_ID : Phone number ID padrão
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendRequest {
  contact_id: string;
  card_id?: string;
  corpo?: string;
  template_id?: string;
  platform_id?: string;
  phone_number_id?: string;  // Echo phone_number_id (qual linha enviar)
  variables?: Record<string, string>;
  source?: string;
  automacao_execucao_id?: string;
}

interface ContactData {
  id: string;
  nome: string;
  sobrenome: string | null;
  email: string | null;
  telefone: string | null;
  telefone_normalizado: string | null;
  tipo_cliente: string | null;
  data_nascimento: string | null;
  tags: string[] | null;
}

interface CardData {
  id: string;
  titulo: string;
  produto: string;
  data_viagem_inicio: string | null;
  data_viagem_fim: string | null;
  valor_estimado: number | null;
  valor_final: number | null;
  briefing_inicial: Record<string, unknown> | null;
  dono_atual_id: string | null;
  pipeline_stage_id: string | null;
}

// ---------------------------------------------------------------------------
// Variable rendering: {{contact.nome}}, {{card.titulo}}, etc.
// ---------------------------------------------------------------------------
function renderVariables(
  text: string,
  contact: ContactData | null,
  card: CardData | null,
  agent: { nome: string; email: string; telefone: string | null } | null,
  extraVars?: Record<string, string>
): string {
  let result = text;

  // Contact variables
  if (contact) {
    result = result.replace(/\{\{contact\.nome\}\}/g, contact.nome || "");
    result = result.replace(
      /\{\{contact\.sobrenome\}\}/g,
      contact.sobrenome || ""
    );
    result = result.replace(
      /\{\{contact\.nome_completo\}\}/g,
      [contact.nome, contact.sobrenome].filter(Boolean).join(" ")
    );
    result = result.replace(
      /\{\{contact\.email\}\}/g,
      contact.email || ""
    );
    result = result.replace(
      /\{\{contact\.telefone\}\}/g,
      contact.telefone || ""
    );
    result = result.replace(
      /\{\{contact\.tipo_cliente\}\}/g,
      contact.tipo_cliente || ""
    );
  }

  // Card variables
  if (card) {
    result = result.replace(/\{\{card\.titulo\}\}/g, card.titulo || "");
    const valor = card.valor_final ?? card.valor_estimado;
    result = result.replace(
      /\{\{card\.valor\}\}/g,
      valor != null
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(valor)
        : ""
    );
    result = result.replace(
      /\{\{card\.data_viagem\}\}/g,
      card.data_viagem_inicio
        ? new Date(card.data_viagem_inicio).toLocaleDateString("pt-BR")
        : ""
    );
    result = result.replace(
      /\{\{card\.data_retorno\}\}/g,
      card.data_viagem_fim
        ? new Date(card.data_viagem_fim).toLocaleDateString("pt-BR")
        : ""
    );
    // Destino from briefing_inicial
    const destinos =
      (card.briefing_inicial as Record<string, unknown>)?.trip_info &&
      ((card.briefing_inicial as Record<string, Record<string, unknown>>)
        .trip_info?.destinos as string);
    result = result.replace(
      /\{\{card\.destino\}\}/g,
      destinos || ""
    );
  }

  // Agent variables
  if (agent) {
    result = result.replace(/\{\{agent\.nome\}\}/g, agent.nome || "");
    result = result.replace(
      /\{\{agent\.primeiro_nome\}\}/g,
      (agent.nome || "").split(" ")[0]
    );
    result = result.replace(
      /\{\{agent\.email\}\}/g,
      agent.email || ""
    );
    result = result.replace(
      /\{\{agent\.telefone\}\}/g,
      agent.telefone || ""
    );
  }

  // System variables
  const now = new Date();
  result = result.replace(
    /\{\{hoje\}\}/g,
    now.toLocaleDateString("pt-BR")
  );
  const diasSemana = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  result = result.replace(
    /\{\{dia_semana\}\}/g,
    diasSemana[now.getDay()]
  );

  // Extra variables
  if (extraVars) {
    for (const [key, value] of Object.entries(extraVars)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalize phone to 55XXXXXXXXXXX format
// ---------------------------------------------------------------------------
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10 && !digits.startsWith("55")) return "55" + digits;
  return digits.length >= 10 ? digits : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: SendRequest = await req.json();

    // --- Validate ---
    if (!body.contact_id) {
      return new Response(
        JSON.stringify({ error: "contact_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!body.corpo && !body.template_id) {
      return new Response(
        JSON.stringify({ error: "corpo ou template_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fetch contact ---
    const { data: contact, error: contactErr } = await supabase
      .from("contatos")
      .select("id, nome, sobrenome, email, telefone, telefone_normalizado, tipo_cliente, data_nascimento, tags")
      .eq("id", body.contact_id)
      .single();

    if (contactErr || !contact) {
      return new Response(
        JSON.stringify({ error: "Contato não encontrado", details: contactErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phone = normalizePhone(contact.telefone_normalizado || contact.telefone);
    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Contato não tem telefone válido" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fetch card (optional) ---
    let card: CardData | null = null;
    if (body.card_id) {
      const { data } = await supabase
        .from("cards")
        .select("id, titulo, produto, data_viagem_inicio, data_viagem_fim, valor_estimado, valor_final, briefing_inicial, dono_atual_id, pipeline_stage_id")
        .eq("id", body.card_id)
        .single();
      card = data;
    }

    // --- Fetch agent (card owner) ---
    let agent: { nome: string; email: string; telefone: string | null } | null = null;
    if (card?.dono_atual_id) {
      const { data } = await supabase
        .from("profiles")
        .select("nome, email, telefone")
        .eq("id", card.dono_atual_id)
        .single();
      agent = data;
    }

    // --- Resolve message body ---
    let messageBody: string;
    let templateUsed: Record<string, unknown> | null = null;

    if (body.template_id) {
      const { data: template, error: tplErr } = await supabase
        .from("mensagem_templates")
        .select("*")
        .eq("id", body.template_id)
        .single();

      if (tplErr || !template) {
        return new Response(
          JSON.stringify({ error: "Template não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      templateUsed = template;

      if (template.modo === "template_fixo") {
        messageBody = renderVariables(
          template.corpo || "",
          contact,
          card,
          agent,
          body.variables
        );
      } else {
        // template_ia ou ia_generativa — corpo deve vir pré-renderizado pelo processor
        // Se chamado diretamente com IA template, usa corpo como fallback
        messageBody = body.corpo || renderVariables(
          template.corpo || template.ia_prompt || "",
          contact,
          card,
          agent,
          body.variables
        );
      }
    } else {
      messageBody = renderVariables(
        body.corpo || "",
        contact,
        card,
        agent,
        body.variables
      );
    }

    if (!messageBody.trim()) {
      return new Response(
        JSON.stringify({ error: "Mensagem vazia após renderização" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Resolve Echo platform & phone line ---
    const echoApiUrl = Deno.env.get("ECHO_API_URL");
    const echoApiKey = Deno.env.get("ECHO_API_KEY");
    const defaultPhoneNumberId = Deno.env.get("ECHO_PHONE_NUMBER_ID");

    if (!echoApiUrl || !echoApiKey) {
      return new Response(
        JSON.stringify({ error: "ECHO_API_URL ou ECHO_API_KEY não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve which phone line to use (priority order):
    // 1. Explicit phone_number_id from request
    // 2. Resolve from card's pipeline phase via whatsapp_linha_config
    // 3. Fallback to default env var
    let resolvedPhoneNumberId = body.phone_number_id || null;
    let resolvedPhoneLabel: string | null = null;

    if (!resolvedPhoneNumberId && card?.pipeline_stage_id) {
      // Try to resolve from the card's current stage → phase → linha_config
      const { data: stageData } = await supabase
        .from("pipeline_stages")
        .select("phase_id")
        .eq("id", card.pipeline_stage_id)
        .single();

      if (stageData?.phase_id) {
        const { data: linhaData } = await supabase
          .from("whatsapp_linha_config")
          .select("phone_number_id, phone_number_label")
          .eq("ativo", true)
          .or(`produto.eq.${card.produto},produto.is.null`)
          .limit(1)
          .maybeSingle();

        if (linhaData) {
          resolvedPhoneNumberId = linhaData.phone_number_id;
          resolvedPhoneLabel = linhaData.phone_number_label;
        }
      }
    }

    if (!resolvedPhoneNumberId) {
      resolvedPhoneNumberId = defaultPhoneNumberId;
    }

    // --- Send via Echo API ---
    const echoPayload = {
      to: phone,
      message: messageBody,
      phone_number_id: resolvedPhoneNumberId,
    };

    console.log(`[send-whatsapp-message] Sending to ${phone}, line=${resolvedPhoneLabel || resolvedPhoneNumberId}, source=${body.source || "api"}, length=${messageBody.length}`);

    const echoResponse = await fetch(echoApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": echoApiKey,
      },
      body: JSON.stringify(echoPayload),
    });

    const echoResult = await echoResponse.json().catch(() => ({}));
    // Echo sometimes returns 500 but the message WAS sent (DB save error on their side)
    // If we got a whatsapp_message_id back, the message was delivered
    const echoSuccess = echoResponse.ok || !!echoResult?.whatsapp_message_id;

    // --- Insert into whatsapp_messages ---
    const { data: msgRecord } = await supabase
      .from("whatsapp_messages")
      .insert({
        contact_id: body.contact_id,
        card_id: body.card_id || null,
        body: messageBody,
        direction: "outbound",
        is_from_me: true,
        type: "text",
        status: echoSuccess ? "sent" : "failed",
        sender_phone: phone,
        sent_by_user_name: agent?.nome || "Automação",
        phone_number_label: resolvedPhoneLabel || "Automação",
        metadata: {
          source: body.source || "api",
          template_id: body.template_id || null,
          automacao_execucao_id: body.automacao_execucao_id || null,
          echo_response: echoResult,
        },
      })
      .select("id")
      .single();

    // --- Insert activity ---
    if (body.card_id) {
      await supabase.from("activities").insert({
        card_id: body.card_id,
        tipo: "whatsapp_automation_sent",
        descricao: `Mensagem automática enviada para ${contact.nome}`,
        metadata: {
          source: body.source || "api",
          template_id: body.template_id || null,
          message_length: messageBody.length,
          success: echoSuccess,
        },
      });
    }

    // --- Update automacao_execucoes if linked ---
    if (body.automacao_execucao_id) {
      const updateData: Record<string, unknown> = {
        whatsapp_message_id: msgRecord?.id || null,
        corpo_renderizado: messageBody,
        enviado_at: new Date().toISOString(),
      };
      if (echoSuccess) {
        updateData.status = "enviado";
      } else {
        updateData.status = "falhou";
        updateData.next_retry_at = new Date(
          Date.now() + 5 * 60 * 1000
        ).toISOString(); // retry in 5min
      }

      await supabase
        .from("automacao_execucoes")
        .update(updateData)
        .eq("id", body.automacao_execucao_id);
    }

    // --- Response ---
    const responseBody = {
      success: echoSuccess,
      whatsapp_message_id: msgRecord?.id || null,
      echo_status: echoResponse.status,
      echo_response: echoResult,
      phone: phone,
      message_length: messageBody.length,
    };

    return new Response(JSON.stringify(responseBody), {
      status: echoSuccess ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-whatsapp-message] Error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
