/**
 * ai-agent-router v2 — Orquestrador de pipeline de agentes IA WhatsApp.
 *
 * Pipeline de 5 etapas (paridade com Julia):
 *   1. buildContext     — Monta historico + metadados + sinais deterministicos
 *   2. Agent Backoffice — Consolida ai_resumo + ai_contexto + detecta role
 *   3. Agent Data       — Atualiza CRM (card, contato, pipeline stage)
 *   4. Agent Persona    — Gera resposta conversacional
 *   5. Validator        — Bloqueia mencoes a IA, tom robotico
 *   6. Formatter        — Quebra em 1-3 mensagens WhatsApp
 *
 * Se agente tem n8n_webhook_url, delega para n8n (modo legacy Julia).
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
  fallback_agent_id: string | null;
  n8n_webhook_url: string | null;
  template_id: string | null;
  is_template_based: boolean;
  persona: string | null;
}

interface BusinessConfig {
  company_name: string | null;
  company_description: string | null;
  tone: string | null;
  language: string | null;
  pricing_model: string | null;
  pricing_json: Record<string, unknown>;
  fee_presentation_timing: string | null;
  process_steps: string[];
  methodology_text: string | null;
  calendar_system: string | null;
  calendar_config: Record<string, unknown>;
  protected_fields: string[];
  auto_update_fields: string[];
  contact_update_fields: string[];
  form_data_fields: string[];
  has_secondary_contacts: boolean;
  secondary_contact_role_name: string;
  secondary_contact_fields: string[];
  escalation_triggers: Array<Record<string, unknown>>;
}

interface QualificationStage {
  stage_order: number;
  stage_name: string;
  stage_key: string | null;
  question: string;
  subquestions: string[];
  disqualification_triggers: Array<{ trigger: string; message: string }>;
  advance_to_stage_id: string | null;
  advance_condition: string | null;
  response_options: string[] | null;
}

interface SpecialScenario {
  scenario_name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  response_adjustment: string | null;
  simplified_qualification: QualificationStage[] | null;
  skip_fee_presentation: boolean;
  skip_meeting_scheduling: boolean;
  auto_assign_tag: string | null;
  handoff_message: string | null;
  target_agent_id: string | null;
}

interface ConversationContext {
  historico: string;
  historico_compacto: string;
  is_primeiro_contato: boolean;
  last_message_who: "lead" | "owner" | "";
  owner_first_message: boolean;
  first_lead_message_only: boolean;
  lead_replied_now: boolean;
  lead_spoke_this_run: boolean;
  meeting_created_or_confirmed: boolean;
  stage_signal: string;
  turn_count: number;
  contact_name: string;
  contact_email: string;
  contact_role: string;
  contato_id: string;
  card_id: string | null;
  card_titulo: string | null;
  pipeline_stage_id: string | null;
  ai_resumo: string;
  ai_contexto: string;
  sdr_owner_id: string | null;
  pessoa_principal_nome: string | null;
  form_data: Record<string, string>;
}

interface BackofficeOutput {
  ai_resumo: string;
  ai_contexto: string;
  detected_role: string;
  mudancas: { ai_resumo: boolean; ai_contexto: boolean };
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
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return true;
  }
  return true;
}

/** Converte message_type para placeholder text (como Julia faz) */
function messageTypeToPlaceholder(type: string | undefined, text: string): string {
  if (!type || type === "text") return text;
  const map: Record<string, string> = {
    audio: "[Áudio recebido - processando transcrição...]",
    image: text || "[Imagem recebida - analisando conteúdo...]",
    document: `[Documento recebido: ${text || "arquivo"}]`,
    video: text || "[Vídeo recebido]",
    location: "[Localização recebida]",
    sticker: "[Sticker recebido]",
  };
  return map[type] || text || "[Tipo de mensagem não suportada]";
}

// ---------------------------------------------------------------------------
// 1. Find Agent
// ---------------------------------------------------------------------------

async function findAgentForLine(
  supabase: SupabaseClient,
  phoneNumberLabel: string | undefined,
  phoneNumberId: string | undefined,
  messageText: string,
): Promise<AgentConfig | null> {
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

  const { data: configs } = await supabase
    .from("ai_agent_phone_line_config")
    .select(`
      priority,
      ai_agents(
        id, nome, tipo, modelo, temperature, max_tokens,
        system_prompt, persona, routing_criteria, escalation_rules,
        memory_config, fallback_message, fallback_agent_id,
        n8n_webhook_url, template_id, is_template_based
      )
    `)
    .in("phone_line_id", lineIds)
    .eq("ativa", true)
    .order("priority", { ascending: false });

  if (!configs || configs.length === 0) return null;

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
// 2. Load Agent Config (business, qualification, scenarios)
// ---------------------------------------------------------------------------

async function loadAgentConfig(supabase: SupabaseClient, agentId: string) {
  const [bizRes, qualRes, scenarioRes] = await Promise.all([
    supabase
      .from("ai_agent_business_config")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle(),
    supabase
      .from("ai_agent_qualification_flow")
      .select("*")
      .eq("agent_id", agentId)
      .order("stage_order", { ascending: true }),
    supabase
      .from("ai_agent_special_scenarios")
      .select("*")
      .eq("agent_id", agentId)
      .eq("enabled", true)
      .order("priority", { ascending: false }),
  ]);

  return {
    business: (bizRes.data as BusinessConfig | null) || null,
    qualification: (qualRes.data as QualificationStage[]) || [],
    scenarios: (scenarioRes.data as SpecialScenario[]) || [],
  };
}

// ---------------------------------------------------------------------------
// 3. Find/Create Contact
// ---------------------------------------------------------------------------

async function findOrCreateContact(
  supabase: SupabaseClient,
  phone: string,
  name?: string,
): Promise<string | null> {
  const normalized = normalizePhone(phone);

  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .or(`telefone.eq.${normalized},telefone_normalizado.eq.${normalized}`)
    .limit(1)
    .single();

  if (existing) return existing.id;

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
// 4. Manage Conversation
// ---------------------------------------------------------------------------

async function getOrCreateConversation(
  supabase: SupabaseClient,
  contactId: string,
  agentId: string,
  phoneNumberId?: string,
): Promise<string> {
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
    const hoursSince = (Date.now() - new Date(existing.updated_at).getTime()) / 3_600_000;
    if (hoursSince > 24) {
      await supabase
        .from("ai_conversations")
        .update({ status: "archived", ended_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return existing.id;
    }
  }

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

  await supabase.from("ai_conversation_state").insert({
    conversation_id: created.id,
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// 5. Build Conversation Context (paridade com "Historico Texto" da Julia)
// ---------------------------------------------------------------------------

async function buildConversationContext(
  supabase: SupabaseClient,
  conversationId: string,
  contactId: string,
  agentConfig: { business: BusinessConfig | null },
): Promise<ConversationContext> {
  // Carregar mensagens WhatsApp do contato (como Julia faz)
  const { data: contact } = await supabase
    .from("contatos")
    .select("id, nome, sobrenome, email, cpf, passaporte, data_nascimento, pessoa_principal_id")
    .eq("id", contactId)
    .single();

  // Buscar card ativo
  const { data: cards } = await supabase
    .from("cards")
    .select("id, titulo, pipeline_stage_id, ai_resumo, ai_contexto, responsavel_id, produto_data")
    .eq("contato_principal_id", contactId)
    .in("status", ["aberto", "novo"])
    .order("created_at", { ascending: false })
    .limit(1);

  const card = cards?.[0] || null;

  // Buscar historico de turns da conversa AI
  const { data: turns } = await supabase
    .from("ai_conversation_turns")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  const msgs = turns || [];

  // Formatar historico (como Julia: "DD/MM/YY_HH:MM_[who]: [msg]")
  const historico = msgs
    .map((m) => {
      const d = new Date(m.created_at);
      const ts = `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}_${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const who = m.role === "user" ? "lead" : "owner";
      return `${ts}_[${who}]: ${m.content}`;
    })
    .join("\n");

  const historico_compacto = msgs.slice(-8)
    .map((m) => {
      const who = m.role === "user" ? "lead" : "owner";
      return `[${who}]: ${m.content}`;
    })
    .join("\n");

  // Sinais deterministicos (replica Julia)
  const hasOwner = msgs.some((m) => m.role === "assistant");
  const hasLead = msgs.some((m) => m.role === "user");
  const lastMsg = msgs[msgs.length - 1];
  const lastWho = lastMsg ? (lastMsg.role === "user" ? "lead" : "owner") : "";

  // Verificar se owner enviou antes do ultimo lead
  const lastLeadIdx = msgs.findLastIndex((m) => m.role === "user");
  const ownerBeforeLast = lastLeadIdx > 0 &&
    msgs.slice(0, lastLeadIdx).some((m) => m.role === "assistant");

  // Meeting detection (regex em msgs recentes do bot)
  const recentBotMsgs = msgs.filter((m) => m.role === "assistant").slice(-3);
  const meetingRegex = /agendad|confirmad|reunião marcada|horário combinado/i;
  const meetingDetected = recentBotMsgs.some((m) => meetingRegex.test(m.content));

  // Detectar contact_role
  let contactRole = "primary";
  if (contact?.pessoa_principal_id && contact.pessoa_principal_id !== contact.id) {
    contactRole = "traveler";
  }

  // Buscar pessoa principal nome (se traveler)
  let pessoaPrincipalNome: string | null = null;
  if (contactRole === "traveler" && contact?.pessoa_principal_id) {
    const { data: principal } = await supabase
      .from("contatos")
      .select("nome, sobrenome")
      .eq("id", contact.pessoa_principal_id)
      .single();
    if (principal) {
      pessoaPrincipalNome = [principal.nome, principal.sobrenome].filter(Boolean).join(" ");
    }
  }

  // Form data (dados ja preenchidos do marketing)
  const formData: Record<string, string> = {};
  if (card?.produto_data && typeof card.produto_data === "object") {
    const pd = card.produto_data as Record<string, unknown>;
    const formFields = agentConfig.business?.form_data_fields || [];
    for (const field of formFields) {
      if (pd[field]) formData[field] = String(pd[field]);
    }
  }

  return {
    historico,
    historico_compacto,
    is_primeiro_contato: msgs.length <= 1,
    last_message_who: lastWho as "lead" | "owner" | "",
    owner_first_message: hasOwner && !hasLead,
    first_lead_message_only: hasLead && !hasOwner,
    lead_replied_now: lastWho === "lead" && ownerBeforeLast,
    lead_spoke_this_run: lastWho === "lead",
    meeting_created_or_confirmed: meetingDetected,
    stage_signal: "",
    turn_count: msgs.filter((m) => m.role === "user").length,
    contact_name: [contact?.nome, contact?.sobrenome].filter(Boolean).join(" ") || "Cliente",
    contact_email: contact?.email || "",
    contact_role: contactRole,
    contato_id: contactId,
    card_id: card?.id || null,
    card_titulo: card?.titulo || null,
    pipeline_stage_id: card?.pipeline_stage_id || null,
    ai_resumo: card?.ai_resumo || "",
    ai_contexto: card?.ai_contexto || "",
    sdr_owner_id: card?.responsavel_id || null,
    pessoa_principal_nome: pessoaPrincipalNome,
    form_data: formData,
  };
}

// ---------------------------------------------------------------------------
// 6. Call LLM (OpenAI)
// ---------------------------------------------------------------------------

async function callLLM(
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: string; content: string }>,
): Promise<{ response: string; inputTokens: number; outputTokens: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const messages = [
    { role: "system", content: systemPrompt },
    ...(history || []),
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    response: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

// ---------------------------------------------------------------------------
// 7. Pipeline Step: Backoffice Agent
// ---------------------------------------------------------------------------

async function runBackofficeAgent(
  agent: AgentConfig,
  ctx: ConversationContext,
  business: BusinessConfig | null,
): Promise<BackofficeOutput> {
  // Se nao e template-based, pular (agente legado so tem 1 prompt)
  if (!agent.is_template_based) {
    return {
      ai_resumo: ctx.ai_resumo,
      ai_contexto: ctx.ai_contexto,
      detected_role: ctx.contact_role,
      mudancas: { ai_resumo: false, ai_contexto: false },
    };
  }

  const prompt = `Voce e um analista de backoffice que consolida fatos do cliente.

Dados:
- Historico: ${ctx.historico}
- Resumo atual: ${ctx.ai_resumo || "(vazio)"}
- Contexto atual: ${ctx.ai_contexto || "(vazio)"}
- Role do contato: ${ctx.contact_role}
- Nome: ${ctx.contact_name}

REGRAS:
1. Atualize ai_resumo APENAS com fatos EXPLICITAMENTE ditos pelo cliente
2. Atualize ai_contexto com sequencia cronologica dos eventos
3. Se contact_role = "traveler": prefixe com [Viajante: ${ctx.contact_name}]
4. NUNCA invente, infira ou assuma
5. Se nada mudou, mantenha textos identicos ao atual
6. Em primeiro contato generico: NAO altere ai_resumo, apenas ai_contexto

Resposta OBRIGATORIA em JSON:
{
  "ai_resumo": "<texto final>",
  "ai_contexto": "<texto final>",
  "detected_role": "primary"|"traveler",
  "mudancas": { "ai_resumo": true|false, "ai_contexto": true|false }
}`;

  try {
    const { response } = await callLLM(
      agent.modelo, 0.3, 1024,
      prompt, ctx.historico_compacto,
    );
    const parsed = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return {
      ai_resumo: parsed.ai_resumo || ctx.ai_resumo,
      ai_contexto: parsed.ai_contexto || ctx.ai_contexto,
      detected_role: parsed.detected_role || ctx.contact_role,
      mudancas: parsed.mudancas || { ai_resumo: false, ai_contexto: false },
    };
  } catch (err) {
    console.error("Backoffice agent error:", err);
    return {
      ai_resumo: ctx.ai_resumo,
      ai_contexto: ctx.ai_contexto,
      detected_role: ctx.contact_role,
      mudancas: { ai_resumo: false, ai_contexto: false },
    };
  }
}

// ---------------------------------------------------------------------------
// 8. Pipeline Step: Data Agent
// ---------------------------------------------------------------------------

async function runDataAgent(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
): Promise<void> {
  if (!agent.is_template_based || !ctx.card_id) return;

  // Aplicar mudancas do backoffice
  if (backoffice.mudancas.ai_resumo || backoffice.mudancas.ai_contexto) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (backoffice.mudancas.ai_resumo) patch.ai_resumo = backoffice.ai_resumo;
    if (backoffice.mudancas.ai_contexto) patch.ai_contexto = backoffice.ai_contexto;

    await supabase.from("cards").update(patch).eq("id", ctx.card_id);
  }

  // Avancar pipeline (regras deterministicas como Julia)
  if (backoffice.detected_role !== "traveler") {
    let newStageId: string | null = null;

    // Usar stage_signal se presente
    if (ctx.stage_signal) {
      newStageId = ctx.stage_signal;
    }
    // Usar qualification flow para determinar avancos
    else if (qualification.length > 0) {
      for (const stage of qualification) {
        if (stage.advance_to_stage_id && stage.advance_condition) {
          // Avanco baseado nos sinais deterministicos
          if (stage.advance_condition === "first_lead_message" && ctx.first_lead_message_only) {
            newStageId = stage.advance_to_stage_id;
          }
          if (stage.advance_condition === "lead_replied" && ctx.lead_replied_now) {
            newStageId = stage.advance_to_stage_id;
          }
          if (stage.advance_condition === "meeting_confirmed" && ctx.meeting_created_or_confirmed) {
            newStageId = stage.advance_to_stage_id;
          }
        }
      }
    }

    if (newStageId && newStageId !== ctx.pipeline_stage_id) {
      await supabase
        .from("cards")
        .update({ pipeline_stage_id: newStageId, updated_at: new Date().toISOString() })
        .eq("id", ctx.card_id);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Pipeline Step: Persona Agent
// ---------------------------------------------------------------------------

async function runPersonaAgent(
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
  scenarios: SpecialScenario[],
  userMessage: string,
): Promise<string> {
  // Para agentes nao-template, usar o system_prompt original (v1 behavior)
  if (!agent.is_template_based) {
    let enrichedPrompt = agent.system_prompt;
    if (ctx.contact_name) enrichedPrompt += `\n\n--- CLIENTE ---\n${ctx.contact_name}`;
    if (ctx.ai_resumo) enrichedPrompt += `\n\n--- RESUMO ---\n${ctx.ai_resumo}`;

    const history = ctx.historico_compacto.split("\n")
      .filter(Boolean)
      .map((line) => {
        const isLead = line.includes("[lead]:");
        return {
          role: isLead ? "user" : "assistant",
          content: line.replace(/\[(?:lead|owner)\]:\s*/, ""),
        };
      });

    const { response } = await callLLM(
      agent.modelo, agent.temperature, agent.max_tokens,
      enrichedPrompt, userMessage, history,
    );
    return response;
  }

  // Template-based: montar prompt completo
  const qualStages = qualification
    .map((s) => `${s.stage_order}) ${s.question}${s.response_options ? ` [Opções: ${s.response_options.join(", ")}]` : ""}`)
    .join("\n");

  const disqualRules = qualification
    .flatMap((s) => s.disqualification_triggers)
    .map((d) => `- ${d.trigger}: "${d.message}"`)
    .join("\n");

  const scenarioText = scenarios
    .map((s) => {
      const keywords = (s.trigger_config?.keywords as string[])?.join(", ") || s.scenario_name;
      let text = `Se detectar "${keywords}": ${s.response_adjustment || ""}`;
      if (s.skip_fee_presentation) text += " NAO apresente taxa.";
      if (s.skip_meeting_scheduling) text += " NAO agende reuniao.";
      if (s.auto_assign_tag) text += ` Atribua tag "${s.auto_assign_tag}".`;
      if (s.handoff_message) text += ` Handoff: "${s.handoff_message}"`;
      return text;
    })
    .join("\n");

  const formDataText = Object.entries(ctx.form_data)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const feeMsg = business?.pricing_json
    ? `Taxa: ${(business.pricing_json as Record<string, unknown>).fee || "a combinar"} ${(business.pricing_json as Record<string, unknown>).currency || "BRL"}`
    : "";

  const personaPrompt = `Voce e ${agent.nome}, ${agent.persona || "assistente"} da ${business?.company_name || "empresa"}.

Contexto:
- ai_resumo: ${backoffice.ai_resumo || "(vazio)"}
- ai_contexto: ${backoffice.ai_contexto || "(vazio)"}
- Nome: ${ctx.contact_name}
- Primeiro contato: ${ctx.is_primeiro_contato}
- Role: ${backoffice.detected_role}
${ctx.pessoa_principal_nome ? `- Nome principal: ${ctx.pessoa_principal_nome}` : ""}

${formDataText ? `DADOS JA PREENCHIDOS (NAO RE-PERGUNTE):\n${formDataText}\nSe ja tem os dados essenciais, pule qualificacao e apresente processo direto.\nNUNCA cite "formulario" ou "sistema".` : ""}

${backoffice.detected_role === "traveler" ? `COMPORTAMENTO TRAVELER:
1. Cumprimente pelo nome do viajante
2. Referencie "a viagem com ${ctx.pessoa_principal_nome}"
3. NUNCA peca taxa/pagamento/reuniao
4. PODE coletar: ${business?.secondary_contact_fields?.join(", ") || "passaporte, CPF, data nascimento"}
5. NUNCA desqualifique traveler` : ""}

${business?.methodology_text ? `O QUE OFERECEMOS:\n${business.methodology_text}` : ""}

${qualStages ? `QUALIFICACAO (so o que falta):\n${qualStages}\nUMA pergunta por vez. Responda primeiro, depois pergunte.` : ""}

${feeMsg && business?.fee_presentation_timing !== "never" ? `TAXA: ${feeMsg}\nApresentar: ${business?.fee_presentation_timing || "after_qualification"}` : ""}

${disqualRules ? `DESQUALIFICACAO (APENAS estes cenarios):\n${disqualRules}\nGrupo grande NAO e desqualificacao. Orcamento baixo NAO e desqualificacao.` : ""}

${scenarioText ? `CENARIOS ESPECIAIS:\n${scenarioText}` : ""}

HANDOFF: Use quando cliente insiste em humano ou reclamacao seria.
Finalize: "Vou verificar aqui e te retorno em breve!" NUNCA mencione transferencia.

PRIMEIRO CONTATO: Se is_primeiro_contato=true, NAO se apresente novamente. Avance direto.

FORMATO: 1-3 frases por msg WhatsApp. Tom: ${business?.tone || "professional"}. pt-BR natural.
NUNCA mencione IA, sistema, formulario, tools, regras internas.

SAIDA: APENAS texto WhatsApp pronto para enviar.`;

  const history = ctx.historico_compacto.split("\n")
    .filter(Boolean)
    .map((line) => {
      const isLead = line.includes("[lead]:");
      return {
        role: isLead ? "user" : "assistant",
        content: line.replace(/\[(?:lead|owner)\]:\s*/, ""),
      };
    });

  const { response } = await callLLM(
    agent.modelo, agent.temperature, agent.max_tokens,
    personaPrompt, userMessage, history,
  );
  return response;
}

// ---------------------------------------------------------------------------
// 10. Pipeline Step: Validator
// ---------------------------------------------------------------------------

async function runValidator(
  agent: AgentConfig,
  response: string,
  ctx: ConversationContext,
  scenarios: SpecialScenario[],
): Promise<string> {
  if (!agent.is_template_based) return response;

  const activeScenarioChecks = scenarios
    .map((s) => {
      const checks: string[] = [];
      if (s.skip_fee_presentation) checks.push(`Se cenario "${s.scenario_name}" ativo: NÃO pode ter menção a taxa/fee`);
      if (s.skip_meeting_scheduling) checks.push(`Se cenario "${s.scenario_name}" ativo: NÃO pode agendar reunião`);
      return checks.join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const validatorPrompt = `Voce e um validador de qualidade de mensagens WhatsApp.
Analise a resposta abaixo e verifique:

1. Menciona IA, robo, modelo, prompt, sistema, agente, chatbot? → BLOQUEIA
2. Inventa fatos nao presentes no contexto? → BLOQUEIA
3. Tom frio, robotico ou agressivo? → CORRIJA para tom natural
4. Repete introducao quando NAO e primeiro contato (is_primeiro_contato=${ctx.is_primeiro_contato})? → CORRIJA
5. Menciona "formulario", "dados do sistema", "cadastro"? → BLOQUEIA
6. Rejeita lead sem investigar (primeira msg ou sem confirmar)? → BLOQUEIA
${activeScenarioChecks ? `7. Cenarios especiais:\n${activeScenarioChecks}` : ""}

RESPOSTA a validar:
"""
${response}
"""

Se TUDO OK: responda EXATAMENTE o texto original, sem alteracoes.
Se PRECISA CORRECAO: responda o texto CORRIGIDO, pronto para enviar.

SAIDA: APENAS o texto final (original ou corrigido). Nada mais.`;

  try {
    const { response: validated } = await callLLM(
      "gpt-4.1-mini", 0.1, 1024,
      validatorPrompt, response,
    );
    return validated.trim() || response;
  } catch (err) {
    console.error("Validator error:", err);
    return response; // Fallback: envia sem validar
  }
}

// ---------------------------------------------------------------------------
// 11. Pipeline Step: Formatter (split WhatsApp messages)
// ---------------------------------------------------------------------------

function formatWhatsAppMessages(text: string): string[] {
  // Se ja e curto, envia como esta
  if (text.length < 300) return [text.trim()];

  // Tentar dividir por paragrafos (dupla quebra de linha)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length >= 2 && paragraphs.length <= 3) {
    return paragraphs.map((p) => p.trim());
  }

  // Se muitos paragrafos, agrupar em ate 3 mensagens
  if (paragraphs.length > 3) {
    const perMsg = Math.ceil(paragraphs.length / 3);
    const msgs: string[] = [];
    for (let i = 0; i < paragraphs.length; i += perMsg) {
      msgs.push(paragraphs.slice(i, i + perMsg).join("\n\n").trim());
    }
    return msgs.slice(0, 3);
  }

  // Dividir por sentencas
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length <= 3) return sentences.map((s) => s.trim());

  // Agrupar sentencas em 2-3 mensagens
  const perMsg = Math.ceil(sentences.length / Math.min(3, Math.ceil(sentences.length / 2)));
  const msgs: string[] = [];
  for (let i = 0; i < sentences.length; i += perMsg) {
    msgs.push(sentences.slice(i, i + perMsg).join(" ").trim());
  }
  return msgs.slice(0, 3);
}

// ---------------------------------------------------------------------------
// 12. Send Response
// ---------------------------------------------------------------------------

async function sendResponse(
  contactId: string,
  cardId: string | null,
  messages: string[],
  phoneNumberId?: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  for (const msg of messages) {
    if (!msg.trim()) continue;
    const body: Record<string, unknown> = {
      contact_id: contactId,
      corpo: msg,
      source: "ai_agent",
    };
    if (cardId) body.card_id = cardId;
    if (phoneNumberId) body.phone_number_id = phoneNumberId;

    try {
      await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error("send-whatsapp-message error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Check Escalation
// ---------------------------------------------------------------------------

async function checkEscalation(
  supabase: SupabaseClient,
  conversationId: string,
  agent: AgentConfig,
  turnCount: number,
  business: BusinessConfig | null,
): Promise<{ escalated: boolean; message: string }> {
  // Check agent-level rules
  for (const rule of agent.escalation_rules || []) {
    const turnLimit = (rule.turn_limit as number) || (rule.condition as string)?.match(/turn_count\s*>\s*(\d+)/)?.[1];
    if (turnLimit && turnCount >= Number(turnLimit)) {
      await supabase
        .from("ai_conversations")
        .update({
          status: "escalated",
          escalation_reason: `Turn limit (${turnLimit}) exceeded`,
          escalation_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
      return { escalated: true, message: (rule.message as string) || "Vou conectar com um especialista." };
    }
  }

  // Check business-level triggers
  for (const trigger of business?.escalation_triggers || []) {
    if (trigger.type === "turn_count" && turnCount >= Number(trigger.threshold || 15)) {
      await supabase
        .from("ai_conversations")
        .update({
          status: "escalated",
          escalation_reason: `Business escalation: ${trigger.type}`,
          escalation_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
      return { escalated: true, message: "Vou verificar com a equipe e retorno em breve!" };
    }
  }

  return { escalated: false, message: "" };
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const input: IncomingMessage = await req.json();

    if (!input.contact_phone || !input.message_text) {
      return new Response(
        JSON.stringify({ error: "contact_phone and message_text required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Converter message_type para placeholder
    const processedText = messageTypeToPlaceholder(input.message_type, input.message_text);

    // ── 1. Encontrar agente ──
    const agent = await findAgentForLine(
      supabase,
      input.phone_number_label,
      input.phone_number_id,
      processedText,
    );

    if (!agent) {
      return new Response(
        JSON.stringify({ handled: false, reason: "no_agent_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Se agente tem n8n_webhook_url, delegar (modo legacy Julia)
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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        console.error("n8n forward error:", err);
      }
    }

    // ── 2. Carregar config completa do agente ──
    const agentConfig = await loadAgentConfig(supabase, agent.id);

    // ── 3. Encontrar/criar contato ──
    const contactId = await findOrCreateContact(supabase, input.contact_phone, input.contact_name);
    if (!contactId) {
      return new Response(
        JSON.stringify({ error: "Failed to resolve contact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Gerenciar conversa ──
    const conversationId = await getOrCreateConversation(
      supabase, contactId, agent.id, input.phone_number_id,
    );

    // ── 5. Salvar mensagem do usuario ──
    await supabase.from("ai_conversation_turns").insert({
      conversation_id: conversationId,
      role: "user",
      content: processedText,
    });

    // ── 6. Build context (paridade com "Historico Texto") ──
    const ctx = await buildConversationContext(
      supabase, conversationId, contactId, agentConfig,
    );

    // ── 7. Check escalation ──
    const { escalated, message: escalationMsg } = await checkEscalation(
      supabase, conversationId, agent, ctx.turn_count, agentConfig.business,
    );
    if (escalated) {
      const msgs = formatWhatsAppMessages(escalationMsg);
      await sendResponse(contactId, ctx.card_id, msgs, input.phone_number_id);
      return new Response(
        JSON.stringify({ handled: true, agent: agent.nome, escalated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // PIPELINE DE 5 ETAPAS (paridade com Julia)
    // ═══════════════════════════════════════════════════════════════════

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // ── Step 1: Backoffice Agent ──
    const backoffice = await runBackofficeAgent(agent, ctx, agentConfig.business);

    // ── Step 2: Data Agent ──
    await runDataAgent(
      supabase, agent, ctx, backoffice,
      agentConfig.business, agentConfig.qualification,
    );

    // ── Step 3: Persona Agent ──
    const rawResponse = await runPersonaAgent(
      agent, ctx, backoffice,
      agentConfig.business, agentConfig.qualification, agentConfig.scenarios,
      processedText,
    );

    // ── Step 4: Validator ──
    const validatedResponse = await runValidator(agent, rawResponse, ctx, agentConfig.scenarios);

    // ── Step 5: Formatter ──
    const messages = formatWhatsAppMessages(validatedResponse);

    // ═══════════════════════════════════════════════════════════════════

    // Salvar resposta como turn
    const fullResponse = messages.join("\n\n");
    await supabase.from("ai_conversation_turns").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: fullResponse,
      agent_id: agent.id,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    });

    // Atualizar contadores
    await supabase
      .from("ai_conversations")
      .update({
        message_count: ctx.turn_count + 1,
        ai_message_count: (ctx.turn_count - ctx.turn_count) + 1, // Recalcular
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Enviar via WhatsApp (multiplas mensagens)
    await sendResponse(contactId, ctx.card_id, messages, input.phone_number_id);

    return new Response(
      JSON.stringify({
        handled: true,
        agent: agent.nome,
        conversation_id: conversationId,
        pipeline: agent.is_template_based ? "v2_5step" : "v1_single",
        messages_sent: messages.length,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Agent router error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
