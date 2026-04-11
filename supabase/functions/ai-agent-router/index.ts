/**
 * ai-agent-router — Motor de roteamento e processamento de agentes IA WhatsApp.
 *
 * Chamado pelo whatsapp-webhook quando mensagem chega em linha com agente configurado.
 *
 * POST /functions/v1/ai-agent-router
 * Headers: Authorization: Bearer $SERVICE_ROLE_KEY
 *
 * Body:
 *   {
 *     "contact_phone": "5511999999999",
 *     "message_text": "Olá, quero cotação",
 *     "message_type": "text",            // text, image, audio, document
 *     "phone_number_label": "Julia",
 *     "phone_number_id": "775282882337610",
 *     "contact_name": "João Silva",
 *     "whatsapp_message_id": "wamid.xxx",
 *     "echo_conversation_id": "conv_xxx"
 *   }
 *
 * Fluxo:
 *   1. Identifica linha → busca agentes configurados (ai_agent_phone_line_config)
 *   2. Avalia routing_criteria → seleciona agente de maior prioridade
 *   3. Carrega/cria ai_conversations + ai_conversation_state
 *   4. Monta contexto (historico, card, contato, KB)
 *   5. Chama LLM (Anthropic ou OpenAI) com system prompt + tools
 *   6. Executa skills se LLM pedir
 *   7. Salva turn + atualiza state
 *   8. Envia resposta via send-whatsapp-message
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncomingMessage {
  contact_phone: string;
  message_text: string;
  message_type?: string;
  phone_number_label?: string;
  phone_number_id?: string;
  contact_name?: string;
  whatsapp_message_id?: string;
  echo_conversation_id?: string;
}

interface AgentConfig {
  id: string;
  nome: string;
  tipo: string;
  modelo: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  routing_criteria: Record<string, unknown>;
  escalation_rules: Array<Record<string, unknown>>;
  memory_config: Record<string, unknown>;
  fallback_message: string | null;
  n8n_webhook_url: string | null;
}

interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function matchesRoutingCriteria(
  criteria: Record<string, unknown>,
  messageText: string,
): boolean {
  if (!criteria || Object.keys(criteria).length === 0) return true;

  const keywords = criteria.keywords as string[] | undefined;
  if (keywords && keywords.length > 0) {
    const lower = messageText.toLowerCase();
    const hasMatch = keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (hasMatch) return true;
  }

  // Se tem keywords mas nenhuma bateu, e não tem outros critérios, aceita mesmo assim
  // (agente catch-all quando é o único na linha)
  return true;
}

// ---------------------------------------------------------------------------
// 1. Find Agent for Phone Line
// ---------------------------------------------------------------------------

async function findAgentForLine(
  supabase: SupabaseClient,
  phoneNumberLabel: string | undefined,
  phoneNumberId: string | undefined,
  messageText: string,
): Promise<AgentConfig | null> {
  // Buscar linhas que matcham
  let lineQuery = supabase
    .from("whatsapp_linha_config")
    .select("id")
    .eq("ativo", true);

  if (phoneNumberLabel) {
    lineQuery = lineQuery.eq("phone_number_label", phoneNumberLabel);
  } else if (phoneNumberId) {
    lineQuery = lineQuery.eq("phone_number_id", phoneNumberId);
  } else {
    return null;
  }

  const { data: lines } = await lineQuery;
  if (!lines || lines.length === 0) return null;

  const lineIds = lines.map((l: { id: string }) => l.id);

  // Buscar agentes configurados para essas linhas
  const { data: configs } = await supabase
    .from("ai_agent_phone_line_config")
    .select(`
      priority,
      ai_agents(
        id, nome, tipo, modelo, temperature, max_tokens,
        system_prompt, routing_criteria, escalation_rules,
        memory_config, fallback_message, n8n_webhook_url
      )
    `)
    .in("phone_line_id", lineIds)
    .eq("ativa", true)
    .order("priority", { ascending: false });

  if (!configs || configs.length === 0) return null;

  // Filtrar por routing criteria e pegar o de maior prioridade
  for (const config of configs) {
    const agent = config.ai_agents as unknown as AgentConfig;
    if (!agent) continue;
    if (matchesRoutingCriteria(agent.routing_criteria, messageText)) {
      return agent;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. Find or Create Contact
// ---------------------------------------------------------------------------

async function findOrCreateContact(
  supabase: SupabaseClient,
  phone: string,
  name?: string,
): Promise<string | null> {
  const normalized = normalizePhone(phone);

  // Buscar por telefone normalizado
  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .or(`telefone.eq.${normalized},telefone_normalizado.eq.${normalized}`)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Criar novo contato
  const { data: created, error } = await supabase
    .from("contatos")
    .insert({
      nome: name || "WhatsApp",
      sobrenome: name ? null : normalized.slice(-4),
      telefone: normalized,
      telefone_normalizado: normalized,
      origem: "whatsapp_ai_agent",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating contact:", error);
    return null;
  }
  return created?.id || null;
}

// ---------------------------------------------------------------------------
// 3. Manage Conversation
// ---------------------------------------------------------------------------

async function getOrCreateConversation(
  supabase: SupabaseClient,
  contactId: string,
  agentId: string,
  phoneNumberId?: string,
): Promise<string> {
  // Buscar conversa ativa para este contato + agente
  const { data: existing } = await supabase
    .from("ai_conversations")
    .select("id, updated_at")
    .eq("contact_id", contactId)
    .eq("current_agent_id", agentId)
    .in("status", ["active", "waiting"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    // Se a conversa tem mais de 24h, arquivar e criar nova
    const lastUpdate = new Date(existing.updated_at);
    const hoursSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      await supabase
        .from("ai_conversations")
        .update({ status: "archived", ended_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      // Atualizar updated_at
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return existing.id;
    }
  }

  // Criar nova conversa
  const { data: created, error } = await supabase
    .from("ai_conversations")
    .insert({
      contact_id: contactId,
      primary_agent_id: agentId,
      current_agent_id: agentId,
      status: "active",
      phone_number_id: phoneNumberId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);

  // Criar state
  await supabase.from("ai_conversation_state").insert({
    conversation_id: created.id,
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// 4. Load Conversation History
// ---------------------------------------------------------------------------

async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  maxTurns: number = 20,
): Promise<ConversationTurn[]> {
  const { data: turns } = await supabase
    .from("ai_conversation_turns")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(maxTurns);

  return (turns || []) as ConversationTurn[];
}

// ---------------------------------------------------------------------------
// 5. Load Contact & Card Context
// ---------------------------------------------------------------------------

async function loadContext(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{ contactInfo: string; cardInfo: string }> {
  // Contact
  const { data: contact } = await supabase
    .from("contatos")
    .select("nome, sobrenome, email, tipo_cliente, tags")
    .eq("id", contactId)
    .single();

  let contactInfo = "";
  if (contact) {
    const parts = [];
    if (contact.nome) parts.push(`Nome: ${contact.nome} ${contact.sobrenome || ""}`);
    if (contact.email) parts.push(`Email: ${contact.email}`);
    if (contact.tipo_cliente) parts.push(`Tipo: ${contact.tipo_cliente}`);
    if (contact.tags?.length) parts.push(`Tags: ${contact.tags.join(", ")}`);
    contactInfo = parts.join("\n");
  }

  // Cards ativos do contato
  const { data: cards } = await supabase
    .from("cards")
    .select("titulo, produto, data_viagem_inicio, valor_estimado, valor_final, pipeline_stage_id")
    .eq("contato_principal_id", contactId)
    .in("status", ["aberto", "novo"])
    .order("created_at", { ascending: false })
    .limit(3);

  let cardInfo = "";
  if (cards && cards.length > 0) {
    cardInfo = cards
      .map((c: Record<string, unknown>) => {
        const parts = [`Card: ${c.titulo}`];
        if (c.data_viagem_inicio) parts.push(`Viagem: ${new Date(c.data_viagem_inicio as string).toLocaleDateString("pt-BR")}`);
        const valor = (c.valor_final ?? c.valor_estimado) as number | null;
        if (valor) parts.push(`Valor: R$ ${valor.toLocaleString("pt-BR")}`);
        return parts.join(" | ");
      })
      .join("\n");
  }

  return { contactInfo, cardInfo };
}

// ---------------------------------------------------------------------------
// 6. Call LLM (Anthropic Claude)
// ---------------------------------------------------------------------------

async function callLLM(
  agent: AgentConfig,
  systemPrompt: string,
  history: ConversationTurn[],
  userMessage: string,
): Promise<{ response: string; inputTokens: number; outputTokens: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  // OpenAI Chat Completions API
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: agent.modelo,
      max_tokens: agent.max_tokens,
      temperature: agent.temperature,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  return {
    response: data.choices?.[0]?.message?.content || agent.fallback_message || "Desculpe, houve um erro.",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

// ---------------------------------------------------------------------------
// 7. Check Escalation
// ---------------------------------------------------------------------------

async function checkEscalation(
  supabase: SupabaseClient,
  conversationId: string,
  agent: AgentConfig,
  turnCount: number,
): Promise<boolean> {
  const rules = agent.escalation_rules || [];
  for (const rule of rules) {
    const turnLimit = (rule.turn_limit as number) || 10;
    if (turnCount >= turnLimit) {
      // Escalar
      await supabase
        .from("ai_conversations")
        .update({
          status: "escalated",
          escalation_reason: `Turn limit (${turnLimit}) exceeded`,
          escalation_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 8. Send Response via send-whatsapp-message
// ---------------------------------------------------------------------------

async function sendResponse(
  contactId: string,
  cardId: string | null,
  responseText: string,
  phoneNumberId?: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const body: Record<string, unknown> = {
    contact_id: contactId,
    corpo: responseText,
    source: "ai_agent",
  };
  if (cardId) body.card_id = cardId;
  if (phoneNumberId) body.phone_number_id = phoneNumberId;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("send-whatsapp-message error:", err);
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const input: IncomingMessage = await req.json();

    if (!input.contact_phone || !input.message_text) {
      return new Response(
        JSON.stringify({ error: "contact_phone and message_text required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Encontrar agente para esta linha
    const agent = await findAgentForLine(
      supabase,
      input.phone_number_label,
      input.phone_number_id,
      input.message_text,
    );

    if (!agent) {
      return new Response(
        JSON.stringify({ handled: false, reason: "no_agent_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se agente tem n8n_webhook_url, delegar para n8n (modo avançado)
    if (agent.n8n_webhook_url) {
      try {
        const fwdRes = await fetch(agent.n8n_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        console.log(`Forwarded to n8n agent ${agent.nome}:`, fwdRes.status);
        return new Response(
          JSON.stringify({ handled: true, agent: agent.nome, via: "n8n" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("n8n forward error:", err);
        // Continua com processamento local como fallback
      }
    }

    // 2. Encontrar/criar contato
    const contactId = await findOrCreateContact(
      supabase,
      input.contact_phone,
      input.contact_name,
    );

    if (!contactId) {
      return new Response(
        JSON.stringify({ error: "Failed to resolve contact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Gerenciar conversa
    const conversationId = await getOrCreateConversation(
      supabase,
      contactId,
      agent.id,
      input.phone_number_id,
    );

    // 4. Salvar mensagem do usuario
    await supabase.from("ai_conversation_turns").insert({
      conversation_id: conversationId,
      role: "user",
      content: input.message_text,
    });

    // 5. Carregar historico
    const maxTurns = (agent.memory_config?.max_history_turns as number) || 20;
    const history = await loadConversationHistory(supabase, conversationId, maxTurns);

    // 6. Carregar contexto
    const { contactInfo, cardInfo } = await loadContext(supabase, contactId);

    // Montar system prompt com contexto
    let enrichedPrompt = agent.system_prompt;
    if (contactInfo) {
      enrichedPrompt += `\n\n--- INFORMAÇÕES DO CLIENTE ---\n${contactInfo}`;
    }
    if (cardInfo) {
      enrichedPrompt += `\n\n--- CARDS ATIVOS ---\n${cardInfo}`;
    }

    // 7. Verificar escalacao antes de processar
    const turnCount = history.filter((t) => t.role === "user").length;
    const escalated = await checkEscalation(supabase, conversationId, agent, turnCount);
    if (escalated) {
      // Enviar mensagem de escalacao
      const escalationMsg = (agent.escalation_rules[0]?.message as string) ||
        "Vou transferir você para um especialista.";
      await sendResponse(contactId, null, escalationMsg, input.phone_number_id);
      return new Response(
        JSON.stringify({ handled: true, agent: agent.nome, escalated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Chamar LLM
    const { response, inputTokens, outputTokens } = await callLLM(
      agent,
      enrichedPrompt,
      history.slice(-maxTurns), // Ultimos N turns
      input.message_text,
    );

    // 9. Salvar resposta
    await supabase.from("ai_conversation_turns").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: response,
      agent_id: agent.id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });

    // Atualizar contadores da conversa
    await supabase
      .from("ai_conversations")
      .update({
        message_count: turnCount + 1,
        ai_message_count: history.filter((t) => t.role === "assistant").length + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // 10. Enviar resposta via WhatsApp
    await sendResponse(contactId, null, response, input.phone_number_id);

    return new Response(
      JSON.stringify({
        handled: true,
        agent: agent.nome,
        conversation_id: conversationId,
        tokens: { input: inputTokens, output: outputTokens },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Agent router error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
