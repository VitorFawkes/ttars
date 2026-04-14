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
  media_url?: string;
}

interface AgentConfig {
  id: string;
  org_id: string;
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
// 1a. Inline Media Processing (paridade com process-whatsapp-media)
// ---------------------------------------------------------------------------

const MEDIA_IMAGE_PROMPT = `Descreva esta imagem enviada por um cliente de agência de viagens.
Se for um documento (passaporte, itinerário, reserva de hotel, passagem aérea, comprovante):
- Extraia dados: nomes, datas, destinos, valores, códigos de reserva
Se for uma foto de destino: descreva brevemente o local.
Responda em português, máximo 300 palavras. Seja direto e factual.`;

const MEDIA_DOCUMENT_PROMPT = `Extraia texto e dados relevantes deste documento.
Se for itinerário, reserva, passagem ou comprovante:
- Extraia: datas, destinos, nomes, valores, códigos, companhias
Responda em português, formato estruturado. Máximo 500 palavras.`;

async function downloadMedia(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Manual base64 encode for Deno
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return { base64, mimeType };
}

async function transcribeAudio(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper API error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.text || "";
}

async function analyzeImage(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: [
        { type: "text", text: MEDIA_IMAGE_PROMPT },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" } },
      ] }],
      max_completion_tokens: 1000,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Vision API error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.choices?.[0]?.message?.content || "";
}

async function analyzeDocument(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const ext = mimeType.includes("pdf") ? "pdf" : "bin";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `document.${ext}`);
  formData.append("purpose", "assistants");

  const uploadRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`File upload error ${uploadRes.status}`);
  const fileObj = await uploadRes.json();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: [
          { type: "text", text: MEDIA_DOCUMENT_PROMPT },
          { type: "file", file: { file_id: fileObj.id } },
        ] }],
        max_completion_tokens: 1500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`Chat API error ${res.status}`);
    const result = await res.json();
    return result.choices?.[0]?.message?.content || "";
  } finally {
    fetch(`https://api.openai.com/v1/files/${fileObj.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}

async function processMediaInline(
  messageType: string,
  mediaUrl: string,
  originalText: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.warn("[processMediaInline] No OPENAI_API_KEY, using placeholder");
    return originalText;
  }

  try {
    console.log(`[processMediaInline] Processing ${messageType} from ${mediaUrl.substring(0, 60)}...`);
    const { base64, mimeType } = await downloadMedia(mediaUrl);
    console.log(`[processMediaInline] Downloaded (${Math.round(base64.length / 1024)}KB, ${mimeType})`);

    let content = "";
    if (messageType === "audio") {
      content = await transcribeAudio(base64, mimeType, apiKey);
      return `[Transcrição do áudio]: ${content}`;
    } else if (messageType === "image") {
      content = await analyzeImage(base64, mimeType, apiKey);
      return originalText
        ? `${originalText}\n[Análise da imagem]: ${content}`
        : `[Análise da imagem]: ${content}`;
    } else if (messageType === "document") {
      content = await analyzeDocument(base64, mimeType, apiKey);
      return `[Conteúdo do documento]: ${content}`;
    }
  } catch (err) {
    console.error(`[processMediaInline] Error processing ${messageType}:`, err);
  }
  return originalText;
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
        id, org_id, nome, tipo, modelo, temperature, max_tokens,
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
  orgId?: string,
): Promise<string | null> {
  const normalized = normalizePhone(phone);

  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .eq("telefone", normalized)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const nameParts = (name || "WhatsApp").split(" ");
  const insertData: Record<string, unknown> = {
    nome: nameParts[0],
    sobrenome: nameParts.slice(1).join(" ") || null,
    telefone: normalized,
    origem: "whatsapp_ai_agent",
  };
  if (orgId) insertData.org_id = orgId;

  console.log("[findOrCreateContact] Creating contact:", JSON.stringify(insertData));

  const { data: created, error } = await supabase
    .from("contatos")
    .insert(insertData as any)
    .select("id")
    .single();

  if (error) {
    console.error("[findOrCreateContact] Error:", JSON.stringify(error));
    return null;
  }
  console.log("[findOrCreateContact] Created:", created?.id);
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
  orgId?: string,
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

  const insertConv: Record<string, unknown> = {
    contact_id: contactId,
    primary_agent_id: agentId,
    current_agent_id: agentId,
    status: "active",
    phone_number_id: phoneNumberId,
  };
  if (orgId) insertConv.org_id = orgId;

  const { data: created, error } = await supabase
    .from("ai_conversations")
    .insert(insertConv)
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
    body: JSON.stringify({ model, max_completion_tokens: maxTokens, temperature, messages }),
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
// 6b. Tool Calling Infrastructure (paridade com 7 tools da Julia)
// ---------------------------------------------------------------------------

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Busca informações na base de conhecimento da empresa (FAQ, serviços, preços, processo). Use ANTES de responder sobre serviços, taxas ou processo.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Pergunta ou tema para buscar" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_calendar",
      description: "Verifica agenda do consultor para encontrar horários disponíveis para reunião.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Data início (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Data fim (YYYY-MM-DD)" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Cria tarefa ou reunião no CRM. Use quando o cliente confirmar horário de reunião.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título da tarefa" },
          descricao: { type: "string", description: "Descrição" },
          tipo: { type: "string", enum: ["reuniao", "tarefa", "follow_up"], description: "Tipo" },
          data_vencimento: { type: "string", description: "Data/hora ISO (YYYY-MM-DDTHH:MM:SS)" },
        },
        required: ["titulo", "tipo", "data_vencimento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_tag",
      description: "Atribui tag ao lead (ex: 'Club Med', 'Disney', produto específico).",
      parameters: {
        type: "object",
        properties: {
          tag_name: { type: "string", description: "Nome da tag" },
          tag_color: { type: "string", description: "Cor hex (ex: #3B82F6)", default: "#3B82F6" },
        },
        required: ["tag_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_handoff",
      description: "Transfere conversa para humano. Use quando cliente pede explicitamente ou reclamação séria.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", enum: ["cliente_pede_humano", "reclamacao", "situacao_complexa"], description: "Motivo" },
          context_summary: { type: "string", description: "Resumo do contexto para o humano" },
        },
        required: ["reason", "context_summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_contact",
      description: "Atualiza dados do contato quando o cliente fornece info pessoal.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Primeiro nome" },
          sobrenome: { type: "string", description: "Sobrenome" },
          email: { type: "string", description: "Email" },
          cpf: { type: "string", description: "CPF (apenas números)" },
          passaporte: { type: "string", description: "Número do passaporte" },
          data_nascimento: { type: "string", description: "Data nascimento (YYYY-MM-DD)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "think",
      description: "Raciocínio interno antes de responder. Não visível para o cliente. Use para planejar sua resposta.",
      parameters: {
        type: "object",
        properties: { thought: { type: "string", description: "Seu raciocínio interno" } },
        required: ["thought"],
      },
    },
  },
];

async function loadAgentTools(
  supabase: SupabaseClient,
  agentId: string,
): Promise<ToolDefinition[]> {
  const { data, error } = await supabase
    .from("ai_agent_skills")
    .select("enabled, priority, ai_skills!inner(nome, ativa)")
    .eq("agent_id", agentId)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error) {
    console.warn(`[loadAgentTools] fallback (erro ai_agent_skills):`, error.message);
    return BUILT_IN_TOOLS;
  }

  const enabledNames = new Set<string>();
  for (const row of data ?? []) {
    const skill = Array.isArray(row.ai_skills) ? row.ai_skills[0] : row.ai_skills;
    if (skill?.ativa && skill.nome) enabledNames.add(skill.nome);
  }

  if (enabledNames.size === 0) {
    console.log(`[loadAgentTools] agente ${agentId} sem skills configuradas — fallback BUILT_IN_TOOLS`);
    return BUILT_IN_TOOLS;
  }

  const filtered = BUILT_IN_TOOLS.filter((t) =>
    t.function.name === "think" || enabledNames.has(t.function.name)
  );
  console.log(`[loadAgentTools] agente ${agentId}: ${filtered.length} tools ativas (${[...enabledNames].join(",")})`);
  return filtered;
}

async function executeToolCall(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  ctx: ConversationContext,
  agent: AgentConfig,
): Promise<string> {
  const startTime = Date.now();
  let result = "";

  try {
    switch (toolName) {
      case "search_knowledge_base": {
        const query = args.query as string;
        // Generate embedding for the query
        const apiKey = Deno.env.get("OPENAI_API_KEY")!;
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
        });
        if (!embRes.ok) throw new Error(`Embedding error: ${embRes.status}`);
        const embData = await embRes.json();
        const embedding = embData.data?.[0]?.embedding;

        if (!embedding) return JSON.stringify({ error: "Failed to generate embedding" });

        // Busca em TODAS as KBs vinculadas ao agente via tabela associativa.
        // Threshold 0.4: text-embedding-3-small em textos longos gera similaridades modestas;
        // 0.7 era alto demais (rejeitava tudo). 0.4 balanceia recall vs precisão.
        const { data: items, error: kbErr } = await supabase.rpc("search_agent_knowledge_bases", {
          p_agent_id: agent.id,
          p_query_embedding: `[${embedding.join(",")}]`,
          p_match_threshold: 0.25,
          p_match_count: 5,
        });

        if (kbErr) {
          console.warn("[search_knowledge_base] RPC error:", kbErr.message);
        }

        if (items?.length) {
          result = items.map((i: { titulo: string; conteudo: string }) => `${i.titulo}: ${i.conteudo}`).join("\n\n");
        } else {
          // Fallback defensivo: FAQ antigo em integration_settings (deve estar desabilitado com Luna tendo KB)
          const { data: faq } = await supabase
            .from("integration_settings")
            .select("value")
            .eq("key", "JULIA_FAQ")
            .eq("org_id", agent.org_id)
            .maybeSingle();
          result = faq?.value || "Nenhum resultado relevante encontrado na base de conhecimento.";
        }
        break;
      }

      case "check_calendar": {
        const { data: calResult } = await supabase.rpc("agent_check_calendar", {
          p_owner_id: ctx.sdr_owner_id,
          p_date_from: args.date_from as string,
          p_date_to: args.date_to as string,
        });
        result = JSON.stringify(calResult || { error: "Sem dados de agenda" });
        break;
      }

      case "create_task": {
        if (!ctx.card_id) {
          result = JSON.stringify({ error: "Sem card associado para criar tarefa" });
          break;
        }
        const { error: taskErr } = await supabase.from("tarefas").insert({
          card_id: ctx.card_id,
          titulo: args.titulo as string,
          descricao: args.descricao as string || null,
          tipo: args.tipo as string || "reuniao",
          data_vencimento: args.data_vencimento as string,
          status: args.tipo === "reuniao" ? "agendada" : "pendente",
          concluida: false,
          responsavel_id: ctx.sdr_owner_id,
          org_id: agent.org_id,
        });
        result = taskErr
          ? JSON.stringify({ error: taskErr.message })
          : JSON.stringify({ success: true, tipo: args.tipo, data: args.data_vencimento });
        break;
      }

      case "assign_tag": {
        if (!ctx.card_id) {
          result = JSON.stringify({ error: "Sem card associado" });
          break;
        }
        const { data: tagResult } = await supabase.rpc("agent_assign_tag", {
          p_card_id: ctx.card_id,
          p_tag_name: args.tag_name as string,
          p_tag_color: (args.tag_color as string) || "#3B82F6",
        });
        result = JSON.stringify(tagResult || { success: true });
        break;
      }

      case "request_handoff": {
        if (!ctx.card_id) {
          result = JSON.stringify({ error: "Sem card associado" });
          break;
        }
        const { data: handoffResult } = await supabase.rpc("agent_request_handoff", {
          p_card_id: ctx.card_id,
          p_reason: args.reason as string,
          p_context_summary: args.context_summary as string,
        });
        result = JSON.stringify(handoffResult || { success: true });
        break;
      }

      case "update_contact": {
        const updates: Record<string, unknown> = {};
        const allowedFields = ["nome", "sobrenome", "email", "cpf", "passaporte", "data_nascimento"];
        for (const field of allowedFields) {
          if (args[field]) {
            let val = args[field] as string;
            if (field === "nome" || field === "sobrenome") {
              val = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
            }
            if (field === "cpf") val = val.replace(/\D/g, "").slice(0, 11);
            if (field === "passaporte") val = val.toUpperCase();
            updates[field] = val;
          }
        }
        if (Object.keys(updates).length === 0) {
          result = JSON.stringify({ error: "Nenhum campo válido para atualizar" });
          break;
        }
        const { error: upErr } = await supabase
          .from("contatos")
          .update(updates)
          .eq("id", ctx.contato_id);
        result = upErr
          ? JSON.stringify({ error: upErr.message })
          : JSON.stringify({ success: true, updated: Object.keys(updates) });
        break;
      }

      case "think": {
        result = JSON.stringify({ thought_recorded: true });
        break;
      }

      default:
        result = JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
    }
  } catch (err) {
    console.error(`[executeToolCall] Error in ${toolName}:`, err);
    result = JSON.stringify({ error: String(err) });
  }

  // Log skill usage
  const duration = Date.now() - startTime;
  console.log(`[executeToolCall] ${toolName} completed in ${duration}ms`);

  // Schema real: skill_id, input, output, duration_ms (sem skill_name, input_data, output_data, org_id).
  // Buscar skill_id por nome (pode ser null — não-fatal).
  supabase.from("ai_skills").select("id").eq("nome", toolName).eq("org_id", agent.org_id).maybeSingle()
    .then(({ data: skillRow }) => {
      return supabase.from("ai_skill_usage_logs").insert({
        agent_id: agent.id,
        skill_id: skillRow?.id || null,
        input: args,
        output: { result: result.substring(0, 500), tool_name: toolName },
        duration_ms: duration,
        success: !result.includes('"error"'),
      });
    })
    .then(() => {}).catch(() => {});

  return result;
}

async function callLLMWithTools(
  supabase: SupabaseClient,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  tools: ToolDefinition[],
  ctx: ConversationContext,
  agent: AgentConfig,
): Promise<{ response: string; inputTokens: number; outputTokens: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_ITERATIONS = 5;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const body: Record<string, unknown> = {
      model,
      max_completion_tokens: maxTokens,
      temperature,
      messages,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    totalInputTokens += data.usage?.prompt_tokens || 0;
    totalOutputTokens += data.usage?.completion_tokens || 0;

    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from OpenAI");

    const assistantMsg = choice.message;

    // If no tool calls, return the text response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        response: assistantMsg.content || "",
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    // Process tool calls
    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};
      try {
        fnArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch { /* empty args */ }

      console.log(`[callLLMWithTools] Tool call: ${fnName}(${JSON.stringify(fnArgs).substring(0, 200)})`);

      const toolResult = await executeToolCall(supabase, fnName, fnArgs, ctx, agent);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  // If we exhausted iterations, return the last content we got
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  return {
    response: (lastAssistant?.content as string) || "",
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
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

  // 1. Sempre aplicar mudanças de resumo/contexto do backoffice (determinístico)
  if (backoffice.mudancas.ai_resumo || backoffice.mudancas.ai_contexto) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (backoffice.mudancas.ai_resumo) patch.ai_resumo = backoffice.ai_resumo;
    if (backoffice.mudancas.ai_contexto) patch.ai_contexto = backoffice.ai_contexto;
    await supabase.from("cards").update(patch).eq("id", ctx.card_id);
  }

  // 2. Sinais determinísticos para advance de stage (mantidos como fallback)
  if (backoffice.detected_role !== "traveler") {
    let newStageId: string | null = null;
    if (ctx.stage_signal) {
      newStageId = ctx.stage_signal;
    } else if (qualification.length > 0) {
      for (const stage of qualification) {
        if (!stage.advance_to_stage_id) continue;
        if (stage.advance_condition === "first_lead_message" && ctx.first_lead_message_only) newStageId = stage.advance_to_stage_id;
        if (stage.advance_condition === "lead_replied" && ctx.lead_replied_now) newStageId = stage.advance_to_stage_id;
        if (stage.advance_condition === "meeting_confirmed" && ctx.meeting_created_or_confirmed) newStageId = stage.advance_to_stage_id;
      }
    }
    if (newStageId && newStageId !== ctx.pipeline_stage_id) {
      await supabase.from("cards").update({ pipeline_stage_id: newStageId, updated_at: new Date().toISOString() }).eq("id", ctx.card_id);
    }
  }

  // 3. Data Agent LLM — extrai dados estruturados da conversa (paridade com "Atualiza dados" da Julia).
  // Se viajante, só atualiza dados pessoais do próprio viajante (não avança stage, não edita titulo).
  try {
    await runDataAgentLLM(supabase, agent, ctx, backoffice, business, qualification);
  } catch (err) {
    console.error("[runDataAgentLLM] error (non-fatal):", err);
  }
}

async function runDataAgentLLM(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
): Promise<void> {
  if (!ctx.card_id) return;

  const isTraveler = backoffice.detected_role === "traveler";
  const protectedFields = business?.protected_fields || ["pessoa_principal_id", "produto_data", "valor_estimado", "created_at", "created_by"];

  const stagesOpts = qualification
    .filter((s) => s.advance_to_stage_id)
    .map((s) => `  - "${s.advance_to_stage_id}" (${s.stage_name}${s.advance_condition ? `, condicao: ${s.advance_condition}` : ""})`)
    .join("\n");

  const allowedCardFields = isTraveler
    ? ["ai_resumo", "ai_contexto"]
    : ["titulo", "ai_resumo", "ai_contexto", "pipeline_stage_id", "destino", "data_ida", "data_volta", "numero_viajantes", "orcamento_estimado", "ocasiao_especial", "observacoes_ia"];

  const allowedContactFields = isTraveler
    ? ["cpf", "passaporte", "data_nascimento", "email", "observacoes"]
    : ["nome", "sobrenome", "email", "cpf", "passaporte", "data_nascimento", "observacoes"];

  const prompt = `Voce e o Agente de Dados. Sua tarefa: ler a conversa e decidir se ha dados novos e COMPROVAVEIS pra gravar no CRM. Nao conversa, so decide.

## Contexto
- Card ID: ${ctx.card_id}
- Contato ID: ${ctx.contato_id}
- Role: ${isTraveler ? "traveler (viajante — NAO avance stage, NAO edite titulo, so dados pessoais do viajante)" : "primary"}
- Stage atual: ${ctx.pipeline_stage_id || "(nao definido)"}
- ai_resumo atual: ${backoffice.ai_resumo || "(vazio)"}
- ai_contexto atual: ${backoffice.ai_contexto || "(vazio)"}
- Historico recente:
${ctx.historico_compacto}

## Sinais determinísticos (ja aplicados)
- first_lead_message_only: ${ctx.first_lead_message_only}
- lead_replied_now: ${ctx.lead_replied_now}
- meeting_created_or_confirmed: ${ctx.meeting_created_or_confirmed}

## Stages disponiveis para avanco (use advance_to_stage_id em card_patch se a condicao for INEQUIVOCA)
${stagesOpts || "(nenhum stage configurado com advance_to_stage_id)"}

## Regras
- Grave APENAS dados que o cliente disse EXPLICITAMENTE, nao invente, nao infira.
- Em conflito, prevalece o dado MAIS RECENTE do cliente.
- Nunca gravar null/vazio. Nunca sobrescrever dado existente com valor igual.
- Campos PROTEGIDOS (nao tocar): ${protectedFields.join(", ")}.
- Campos permitidos no card: ${allowedCardFields.join(", ")}.
- Campos permitidos no contato: ${allowedContactFields.join(", ")}.

### Normalizacoes
- titulo (so se primary): "Viagem [Destino] - [Nome]". Ex: "Viagem Italia - Joao". Nao atualizar se ja tem titulo compativel.
- cpf: so digitos, 11 caracteres.
- passaporte: alfanumerico uppercase.
- data_nascimento / data_ida / data_volta: YYYY-MM-DD.
- numero_viajantes: inteiro.
- orcamento_estimado: inteiro em BRL (aceitar "k" = mil).
- nome/sobrenome: primeira letra maiuscula.

### Avanco de stage (so se NAO for traveler)
- Use advance_to_stage_id da lista acima quando a condicao da conversa bater claramente (cliente confirmou reuniao, respondeu primeira vez, etc).
- Se ja ha sinal deterministico que avançou, NAO tente avançar de novo.

## Saida (JSON exato)
{
  "card_patch": { "<campo>": <valor> } ou {},
  "contact_patch": { "<campo>": <valor> } ou {},
  "reasoning": "<1 frase explicando por que atualizou ou por que nao>"
}

Se nao ha nada COMPROVAVEL pra gravar, retorne card_patch e contact_patch vazios.`;

  let parsed: { card_patch?: Record<string, unknown>; contact_patch?: Record<string, unknown>; reasoning?: string };
  try {
    const { response } = await callLLM(agent.modelo, 0.1, 800, prompt, ctx.historico_compacto || "(sem historico)");
    parsed = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch (err) {
    console.warn("[runDataAgentLLM] parse failed:", err);
    return;
  }

  const cardPatch = parsed.card_patch || {};
  const contactPatch = parsed.contact_patch || {};

  if (Object.keys(cardPatch).length > 0) {
    // Filtrar campos bloqueados localmente antes do RPC
    if (isTraveler) {
      delete (cardPatch as Record<string, unknown>).pipeline_stage_id;
      delete (cardPatch as Record<string, unknown>).titulo;
    }
    const { data: updateResult, error: updateErr } = await supabase.rpc("agent_update_card_data", {
      p_card_id: ctx.card_id,
      p_patch: cardPatch,
      p_protected_fields: protectedFields,
    });
    if (updateErr) {
      console.warn("[runDataAgentLLM] card update rpc error:", updateErr.message);
    } else {
      console.log(`[runDataAgentLLM] card updated:`, JSON.stringify(updateResult));
    }
  }

  if (Object.keys(contactPatch).length > 0) {
    const safeContactPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(contactPatch)) {
      if (allowedContactFields.includes(k) && v !== null && v !== "") safeContactPatch[k] = v;
    }
    if (Object.keys(safeContactPatch).length > 0) {
      safeContactPatch.updated_at = new Date().toISOString();
      const { error: contactErr } = await supabase.from("contatos").update(safeContactPatch).eq("id", ctx.contato_id);
      if (contactErr) console.warn("[runDataAgentLLM] contact update error:", contactErr.message);
      else console.log(`[runDataAgentLLM] contact updated:`, Object.keys(safeContactPatch));
    }
  }

  if (parsed.reasoning) {
    console.log(`[runDataAgentLLM] reasoning: ${parsed.reasoning}`);
  }
}

// ---------------------------------------------------------------------------
// 9. Pipeline Step: Persona Agent
// ---------------------------------------------------------------------------

async function runPersonaAgent(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
  scenarios: SpecialScenario[],
  userMessage: string,
): Promise<{ response: string; inputTokens: number; outputTokens: number }> {
  // Para agentes nao-template, usar o system_prompt original (v1 behavior — sem tools)
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

    return callLLM(
      agent.modelo, agent.temperature, agent.max_tokens,
      enrichedPrompt, userMessage, history,
    );
  }

  // Template-based: montar prompt completo + tool calling
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
      if (s.auto_assign_tag) text += ` Use assign_tag("${s.auto_assign_tag}").`;
      if (s.handoff_message) text += ` Use request_handoff se necessário.`;
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

  // Biblioteca de técnicas de vendas e antipadrões — destilada do prompt da Julia (Responde Lead)
  // Aplicável a qualquer agente de pré-venda SPIN/qualificação.
  const SALES_PLAYBOOK = `
## Biblioteca de técnicas (aplicar sempre que couber)

### SPIN (uma pergunta por vez)
- Se ainda não conhece o processo/contexto do cliente: pergunta de **Situação** ("como vocês se organizam hoje pra X?").
- Se já tem situação mas sem dor declarada: pergunta de **Problema** ("o que mais te incomoda nisso hoje?").
- Se há dor declarada: peça **Implicação concreta** ("e isso acaba afetando o que?") e costure dor + impacto em 1 linha.
- Se há impacto: peça número/prioridade. Se cliente relutar, ofereça faixas específicas em vez de números exatos.

### Antipadrões (EVITE sempre)
- **Justificar pergunta.** Em vez de "Pra te ajudar melhor, como vocês...", faça "Como vocês..." direto.
- **Inferir causa não dita.** Em vez de "Imagino que isso te atrapalhe muito", pergunte "Onde isso mais aperta?".
- **Empilhar perguntas.** Uma pergunta única e clara por mensagem.
- **Prometer solução antes da dor.** Não diga "podemos resolver isso" antes de entender problema e impacto.
- **Fechamento frouxo.** Não pergunte "qual horário prefere?". Use slots reais via check_calendar.
- **Pressão.** Se o lead não quiser seguir, agradeça e encerre sem insistir.

### Regra de ouro sobre preço
- NÃO apresente preço/taxa antes de qualificar (a menos que configuração permita).
- Se cliente pede preço cedo e insiste: dê âncora curta e volte ao SPIN.
- Faturamento/orçamento: pergunte antes de convidar pra reunião. Se recusar, ofereça faixas. Se recusar de novo, siga sem travar.

### Escrita WhatsApp
- 1 a 3 frases por mensagem. 1 objetivo por mensagem.
- Sem travessões/hífens como separadores. Sem metalinguagem.
- 0 ou 1 emoji apenas se o lead usar primeiro.
- Nome do cliente com parcimônia — no máximo 1 uso a cada 3 mensagens. Varie aberturas ("Entendi", "Perfeito", "Show", sem muleta repetitiva).
- Se lead indicar desinteresse ou quiser encerrar: agradeça, reconheça e encerre com respeito.
`;

  const personaPrompt = `Voce e ${agent.nome}, ${agent.persona || "assistente"} da ${business?.company_name || "empresa"}.

Contexto:
- ai_resumo: ${backoffice.ai_resumo || "(vazio)"}
- ai_contexto: ${backoffice.ai_contexto || "(vazio)"}
- Nome: ${ctx.contact_name}
- Primeiro contato: ${ctx.is_primeiro_contato}
- Role: ${backoffice.detected_role}
- Card ID: ${ctx.card_id || "(sem card)"}
- Contato ID: ${ctx.contato_id}
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

TOOLS DISPONIVEIS:
- search_knowledge_base: Use ANTES de responder sobre servicos, taxas ou processo
- check_calendar: Use quando cliente perguntar sobre horarios disponiveis
- create_task: Use quando cliente CONFIRMAR horario de reuniao
- assign_tag: Use para classificar o lead (ex: destino mencionado)
- request_handoff: Use SOMENTE quando cliente insiste em humano ou reclamacao seria
- update_contact: Use quando cliente fornecer dados pessoais (nome, email, CPF, passaporte, nascimento)
- think: Use para planejar sua resposta antes de enviar (invisivel ao cliente)

HANDOFF: Finalize: "Vou verificar aqui e te retorno em breve!" NUNCA mencione transferencia.

PRIMEIRO CONTATO: Se is_primeiro_contato=true, NAO se apresente novamente. Avance direto.

FORMATO: 1-3 frases por msg WhatsApp. Tom: ${business?.tone || "professional"}. pt-BR natural.
NUNCA mencione IA, sistema, formulario, tools, regras internas.

${SALES_PLAYBOOK}

CONSULTA OBRIGATÓRIA: antes de falar sobre serviços, taxa, prazos, destinos, pagamento ou tratar objeções, chame search_knowledge_base ANTES e responda em 1-2 frases sem copiar literal.

SAIDA: APENAS texto WhatsApp pronto para enviar. Sem prefixos, sem aspas.`;

  const history = ctx.historico_compacto.split("\n")
    .filter(Boolean)
    .map((line) => {
      const isLead = line.includes("[lead]:");
      return {
        role: isLead ? "user" : "assistant",
        content: line.replace(/\[(?:lead|owner)\]:\s*/, ""),
      };
    });

  // Use tool calling for template-based agents
  const tools = await loadAgentTools(supabase, agent.id);
  return callLLMWithTools(
    supabase,
    agent.modelo, agent.temperature, agent.max_tokens,
    personaPrompt, userMessage, history,
    tools,
    ctx, agent,
  );
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
      const keywords = (s.trigger_config?.keywords as string[] | undefined)?.join(", ") || s.scenario_name;
      const checks: string[] = [];
      if (s.skip_fee_presentation) checks.push(`Se detectar ${keywords}: NÃO pode ter menção a taxa/valor/fee`);
      if (s.skip_meeting_scheduling) checks.push(`Se detectar ${keywords}: NÃO pode agendar reunião`);
      if (s.response_adjustment) checks.push(`Se detectar ${keywords}: ${s.response_adjustment}`);
      if (s.auto_assign_tag) checks.push(`Se detectar ${keywords}: Deve ter chamado assign_tag("${s.auto_assign_tag}")`);
      return checks.join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const validatorPrompt = `Voce e um validador de qualidade de mensagens WhatsApp. A maioria das mensagens esta OK — so intervenha quando algo realmente precisa de ajuste.

Analise a resposta abaixo e verifique:

1. Menciona IA, robo, modelo, prompt, sistema, agente, chatbot, bastidores? → BLOQUEIA
2. Inventa fatos nao presentes no contexto (preços, prazos, features nao mencionadas)? → BLOQUEIA
3. Tom frio, robotico ou agressivo? → CORRIJA para tom natural
4. Repete introducao/apresentacao quando NAO e primeiro contato (is_primeiro_contato=${ctx.is_primeiro_contato})? → CORRIJA
5. Menciona "formulario", "dados do sistema", "cadastro", "ActiveCampaign"? → BLOQUEIA
6. Rejeita/desqualifica lead na primeira mensagem ou sem investigar? → BLOQUEIA (na duvida, avançar)
7. Diz explicitamente "nao trabalhamos com X isolado" sem que o cliente tenha confirmado que quer só isso? → CORRIJA
8. Justifica pergunta ("para te ajudar melhor...", "para eu entender...")? → CORRIJA removendo justificativa
9. Empilha 2+ perguntas na mesma mensagem? → CORRIJA pra UMA pergunta só
${activeScenarioChecks ? `10. Cenarios especiais configurados:\n${activeScenarioChecks}` : ""}

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
  supabase: SupabaseClient,
  contactId: string,
  contactPhone: string,
  cardId: string | null,
  messages: string[],
  phoneNumberId?: string,
): Promise<void> {
  const echoApiUrl = Deno.env.get("ECHO_API_URL");
  const echoApiKey = Deno.env.get("ECHO_API_KEY");
  const defaultPhoneId = Deno.env.get("ECHO_PHONE_NUMBER_ID");

  if (!echoApiUrl || !echoApiKey) {
    console.error("[sendResponse] ECHO_API_URL ou ECHO_API_KEY não configurado");
    return;
  }

  const resolvedPhoneId = phoneNumberId || defaultPhoneId;
  const normalizedPhone = contactPhone.replace(/\D/g, "");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.trim()) continue;

    try {
      // Enviar direto via Echo API (sem intermediar send-whatsapp-message)
      console.log(`[sendResponse] Sending msg ${i + 1}/${messages.length} to ${normalizedPhone} via Echo, phone_id=${resolvedPhoneId}`);

      const echoRes = await fetch(echoApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": echoApiKey,
        },
        body: JSON.stringify({
          to: normalizedPhone,
          message: msg,
          phone_number_id: resolvedPhoneId,
        }),
      });

      const echoResult = await echoRes.json().catch(() => ({}));
      const success = echoRes.ok || !!echoResult?.whatsapp_message_id;

      console.log(`[sendResponse] Echo result: status=${echoRes.status}, success=${success}, wamid=${echoResult?.whatsapp_message_id || 'none'}`);

      // Salvar em whatsapp_messages
      await supabase.from("whatsapp_messages").insert({
        contact_id: contactId,
        card_id: cardId || null,
        body: msg,
        direction: "outbound",
        is_from_me: true,
        type: "text",
        status: success ? "sent" : "failed",
        sender_phone: normalizedPhone,
        sent_by_user_name: "Luna IA",
        phone_number_label: "SDR Trips",
        metadata: {
          source: "ai_agent",
          echo_response: echoResult,
        },
      });

      // Pequeno delay entre mensagens para naturalidade
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error(`[sendResponse] Error sending msg ${i + 1}:`, err);
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

    // Processar mídia (áudio/imagem/documento) se aplicável
    let processedText = messageTypeToPlaceholder(input.message_type, input.message_text);

    if (input.media_url && input.message_type && input.message_type !== "text") {
      processedText = await processMediaInline(input.message_type, input.media_url, input.message_text);
      console.log(`[main] Media processed: ${input.message_type} → ${processedText.substring(0, 100)}...`);
    }

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
    const contactId = await findOrCreateContact(supabase, input.contact_phone, input.contact_name, agent.org_id);
    if (!contactId) {
      return new Response(
        JSON.stringify({ error: "Failed to resolve contact" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 4. Gerenciar conversa ──
    const conversationId = await getOrCreateConversation(
      supabase, contactId, agent.id, input.phone_number_id, agent.org_id,
    );

    // ── 5. Debounce check (20s buffer — paridade com Julia) ──
    const normalizedForBuffer = normalizePhone(input.contact_phone);
    const { data: buffered } = await supabase
      .from("ai_message_buffer")
      .select("id, message_text, message_type, media_url, created_at")
      .eq("contact_phone", normalizedForBuffer)
      .is("processed_at", null)
      .order("created_at", { ascending: true });

    if (buffered && buffered.length > 0) {
      const newest = buffered[buffered.length - 1];
      const ageMs = Date.now() - new Date(newest.created_at).getTime();

      if (ageMs < 20_000) {
        // Still within debounce window — don't process yet
        console.log(`[debounce] ${buffered.length} msgs buffered, newest ${Math.round(ageMs / 1000)}s ago — waiting`);
        return new Response(
          JSON.stringify({ handled: true, debounced: true, buffered_count: buffered.length }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Debounce window passed — combine all buffered messages
      if (buffered.length > 1) {
        const combined = buffered.map((b) => b.message_text).filter(Boolean).join("\n");
        if (combined) {
          processedText = combined;
          console.log(`[debounce] Combined ${buffered.length} messages into one (${combined.length} chars)`);
        }
        // Process media from the last media message in buffer
        const lastMedia = [...buffered].reverse().find((b) => b.message_type !== "text" && b.media_url);
        if (lastMedia) {
          const mediaContent = await processMediaInline(lastMedia.message_type, lastMedia.media_url, lastMedia.message_text);
          processedText = processedText + "\n" + mediaContent;
        }
      }

      // Mark all buffered messages as processed
      await supabase
        .from("ai_message_buffer")
        .update({ processed_at: new Date().toISOString() })
        .eq("contact_phone", normalizedForBuffer)
        .is("processed_at", null);
    }

    // ── 5b. Salvar mensagem do usuario ──
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
      await sendResponse(supabase, contactId, input.contact_phone, ctx.card_id, msgs, input.phone_number_id);
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

    // ── Step 3: Persona Agent (com tool calling) ──
    const personaResult = await runPersonaAgent(
      supabase, agent, ctx, backoffice,
      agentConfig.business, agentConfig.qualification, agentConfig.scenarios,
      processedText,
    );
    const rawResponse = personaResult.response;
    totalInputTokens += personaResult.inputTokens;
    totalOutputTokens += personaResult.outputTokens;

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
    await sendResponse(supabase, contactId, input.contact_phone, ctx.card_id, messages, input.phone_number_id);

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
