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
import { runPersonaAgent_v2 } from "./persona_v2.ts";
import {
  readLastMomentKey,
  upsertLastMomentKey,
  loadPlaybookMoments,
  type IdentityConfig,
  type VoiceConfig,
  type BoundariesConfig,
} from "./playbook_loader.ts";

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
  /**
   * Marker interno: self-call agendado após debounce window. Quando true, o
   * router pula validações iniciais de message_text vazio e só processa o
   * buffer pendente (se houver). Evita loop de drain e ack de msg fantasma.
   */
  _drain?: boolean;
}

// C3 — blocos dinâmicos injetados no prompt a partir da config do agente
// Devolve o label visível do papel secundário (ex: "viajante" em Trips,
// "acompanhante"/"convidado" em Wedding). Lê business.secondary_contact_role_name
// com fallback "viajante" — mantido em pt-BR porque todo o prompt está em pt-BR.
// Internamente o código continua usando a string "traveler" como identificador
// técnico (decoupled do label visível pra não quebrar queries/filters existentes).
function secondaryRoleLabel(business: BusinessConfig | null | undefined): string {
  const raw = business?.secondary_contact_role_name?.trim();
  if (raw && raw !== "traveler") return raw;
  return "viajante";
}

function buildHandoffBlock(agent: AgentConfig): string {
  const signals = agent.handoff_signals?.filter(s => s.enabled) ?? [];
  if (signals.length === 0) return "";
  const items = signals.map(s => `- ${s.description}`).join("\n");
  return `\nSINAIS DE HANDOFF (passar para humano se detectar algum):\n${items}\nUse request_handoff() quando qualquer um se aplicar, com judgment — não por palavra-chave.`;
}

function buildDecisionsBlock(agent: AgentConfig): string {
  const decisions = agent.intelligent_decisions ?? {};
  const active = Object.entries(decisions).filter(([_, d]) => d.enabled);
  if (active.length === 0) return "";
  const items = active.map(([key, d]) => {
    const instr = (d.config?.instructions as string) || "";
    return `- ${key}${instr ? `: ${instr}` : ""}`;
  }).join("\n");
  return `\nDECISÕES INTELIGENTES HABILITADAS:\n${items}`;
}

// buildExtraPromptsBlock foi removido: misturava prompts de OUTROS agentes do
// pipeline (backoffice/data/formatter/validator) no persona e poluía o prompt.
// Cada agente do pipeline puxa seu prompts_extra dedicado no próprio step.

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
  n8n_webhook_url: string | null;
  template_id: string | null;
  is_template_based: boolean;
  persona: string | null;
  handoff_signals?: Array<{ slug: string; enabled: boolean; description: string }> | null;
  intelligent_decisions?: Record<string, { enabled: boolean; config: Record<string, unknown> }> | null;
  prompts_extra?: { context?: string; data_update?: string; formatting?: string; validator?: string } | null;
  pipeline_models?: Record<string, { model?: string; temperature?: number; max_tokens?: number }> | null;
  timings?: { debounce_seconds?: number; typing_delay_seconds?: number; max_message_blocks?: number } | null;
  validator_rules?: Array<{ id: string; condition: string; action: 'block' | 'correct' | 'ignore'; enabled: boolean }> | null;
  test_mode_phone_whitelist?: string[] | null;
  multimodal_config?: { audio?: boolean; image?: boolean; pdf?: boolean } | null;
  handoff_actions?: {
    change_stage_id?: string | null;
    apply_tag?: { color?: string; name?: string } | null;
    notify_responsible?: boolean;
    transition_message?: string | null;
    pause_permanently?: boolean;
  } | null;
  // ---- Playbook v2 (Marco 2 — feature flag + configs) ----
  playbook_enabled?: boolean | null;
  identity_config?: IdentityConfig | null;
  voice_config?: VoiceConfig | null;
  boundaries_config?: BoundariesConfig | null;
}

interface BusinessCustomBlock {
  title: string;
  content: string;
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
  custom_blocks: BusinessCustomBlock[];
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
  maps_to_field: string | null;
  skip_if_filled: boolean;
}

interface SpecialScenario {
  id?: string;
  agent_id?: string;
  scenario_name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  /** Frente B — regra em linguagem natural para match semântico */
  trigger_description: string | null;
  response_adjustment: string | null;
  simplified_qualification: QualificationStage[] | null;
  skip_fee_presentation: boolean;
  skip_meeting_scheduling: boolean;
  auto_assign_tag: string | null;
  /** Frente C — etapa destino quando cenário dispara (runtime aplica automaticamente) */
  auto_transition_stage_id: string | null;
  /** Frente C — notifica o responsável pelo card quando cenário dispara */
  auto_notify_responsible: boolean;
  handoff_message: string | null;
  target_agent_id: string | null;
}

/**
 * Apresentação configurável (ai_agent_presentations) — define como o agente
 * abre conversa em cenários específicos. V1 consome first_contact_inbound
 * no buildPersonaPrompt; first_contact_outbound_form é consumido na edge
 * function separada ai-agent-outbound-trigger.
 */
interface AiAgentPresentation {
  id: string;
  agent_id: string;
  scenario: 'first_contact_inbound' | 'first_contact_outbound_form';
  mode: 'fixed' | 'faithful' | 'concept';
  fixed_template: string | null;
  concept_text: string | null;
  enabled: boolean;
}

interface ConversationContext {
  historico: string;
  historico_compacto: string;
  is_primeiro_contato: boolean;
  /** Se false, contato ainda não tem nome real no banco — agente deve
   *  descobrir na conversa, NÃO usar o placeholder literal. */
  contact_name_known: boolean;
  /**
   * Cenário de apresentação aplicável neste turn. Setado por
   * buildConversationContext quando is_primeiro_contato=true E há linha
   * habilitada em ai_agent_presentations para o agente. Consumido em
   * runPersonaAgent (buildPersonaPrompt injeta bloco dedicado).
   */
  presentation_scenario: 'first_contact_inbound' | null;
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
  // Indica se um humano assumiu (ai_responsavel='humano') ou se o card tem
  // pausa permanente ligada. Main handler usa pra skip pipeline.
  card_paused: boolean;
  card_paused_reason: 'human_handling' | 'pause_permanently' | null;
  // Set by executeToolCall when request_handoff is invoked; main loop
  // reads this to apply handoff_actions (stage change, tag, notification,
  // transition_message override).
  handoff_triggered?: boolean;
  // G5 fix — acumula nomes de tools chamadas neste turno (search_knowledge_base,
  // check_calendar, create_task, assign_tag, request_handoff, update_contact,
  // think, calculate_qualification_score). Populado por executeToolCall, lido
  // pelo main handler no insert em ai_conversation_turns.skills_used.
  skills_used_this_turn?: string[];
  // ---- Playbook v2 (Marco 2 — contexto de momento anterior) ----
  /** Slug do momento classificado no turno anterior (lido de ai_conversation_state).
   *  Usado por moment_detector pra evitar pular momentos e pra fallback. */
  last_moment_key?: string | null;
  /** Conteúdo da última mensagem do lead — usado pra matchesTrigger(keyword).
   *  Derivado do histórico pelo buildConversationContext. */
  last_lead_message?: string | null;
  // ---- Metadata do turno v2 (preenchido por runPersonaAgent_v2) ----
  v2_current_moment_key?: string | null;
  v2_qualification_score_at_turn?: number | null;
  v2_moment_detection_method?: 'deterministic' | 'llm' | 'fallback' | 'manual' | null;
  v2_moment_transition_reason?: string | null;
}

interface BackofficeOutput {
  ai_resumo: string;
  ai_contexto: string;
  detected_role: string;
  mudancas: { ai_resumo: boolean; ai_contexto: boolean };
  // ---- Playbook v2 (Marco 2 — classificação opcional de momento) ----
  /** Slug do momento classificado pelo LLM. Só preenchido quando
   *  agent.playbook_enabled=true. Usado como fallback pelo moment_detector
   *  quando detecção determinística não bate. */
  current_moment_key?: string | null;
  moment_transition_reason?: string | null;
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
  messageType?: string,
): boolean {
  if (!criteria || Object.keys(criteria).length === 0) return true;
  const keywords = criteria.keywords as string[] | undefined;
  if (keywords && keywords.length > 0) {
    // G2: mídias não-texto (áudio/imagem/documento/vídeo/localização/sticker) passam
    // direto do routing por keyword — o placeholder "[Áudio recebido...]" nunca casaria
    // com keywords típicas tipo "cotação/orçamento" e a mensagem cairia em no_agent_configured.
    if (messageType && messageType !== "text") return true;
    const lower = messageText.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return true;
    return false;
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
  multimodalConfig?: { audio?: boolean; image?: boolean; pdf?: boolean } | null,
): Promise<string> {
  // Respeitar toggles do multimodal_config do agente quando fornecido.
  // Se desligado, retorna placeholder sem chamar OpenAI (economiza tokens + evita leak).
  if (multimodalConfig) {
    if (messageType === "audio" && multimodalConfig.audio === false) return originalText || "[Áudio recebido — processamento desabilitado]";
    if (messageType === "image" && multimodalConfig.image === false) return originalText || "[Imagem recebida — processamento desabilitado]";
    if (messageType === "document" && multimodalConfig.pdf === false) return originalText || "[Documento recebido — processamento desabilitado]";
  }

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
  senderPhone: string | undefined,
  messageType?: string,
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
      routing_filter,
      ai_agents!inner(
        id, org_id, nome, tipo, modelo, temperature, max_tokens,
        system_prompt, persona, routing_criteria, escalation_rules,
        memory_config, fallback_message,
        n8n_webhook_url, template_id, is_template_based, ativa,
        handoff_signals, intelligent_decisions, prompts_extra,
        pipeline_models, timings, validator_rules,
        test_mode_phone_whitelist, multimodal_config,
        handoff_actions
      )
    `)
    .in("phone_line_id", lineIds)
    .eq("ativa", true)
    .eq("ai_agents.ativa", true)
    .order("priority", { ascending: false });

  if (!configs || configs.length === 0) {
    console.log(
      `[ai-agent-router] no active agent for line (checked ai_agents.ativa + ai_agent_phone_line_config.ativa): lineIds=${JSON.stringify(lineIds)}`,
    );
    return null;
  }

  const normalizedSender = senderPhone ? normalizePhone(senderPhone) : "";

  for (const config of configs) {
    const agent = config.ai_agents as unknown as AgentConfig & { ativa?: boolean };
    if (!agent) continue;
    if (agent.ativa === false) {
      console.log(
        `[ai-agent-router] blocked: ai_agents.ativa=false for agent ${agent.id} (${agent.nome})`,
      );
      continue;
    }

    // routing_filter: allowlist de telefones. Quando presente, SÓ processa mensagens vindas
    // de sender_phone nessa lista. Útil para testes isolados de agente em linha de produção
    // (ex: testar Luna no TP aceitando só o telefone do dev). Sem filtro → comportamento normal.
    const filter = (config as { routing_filter?: { allowed_phones?: string[] } | null }).routing_filter;
    const allowed = filter?.allowed_phones;
    if (allowed && allowed.length > 0) {
      const allowedNormalized = allowed.map(normalizePhone);
      if (!normalizedSender || !allowedNormalized.includes(normalizedSender)) {
        console.log(
          `[ai-agent-router] blocked by routing_filter: agent=${agent.nome} sender=${normalizedSender || "(none)"} allowed=${JSON.stringify(allowedNormalized)}`,
        );
        continue;
      }
    }

    if (matchesRoutingCriteria(agent.routing_criteria, messageText, messageType)) {
      return agent;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// G1 fix — achar agente por conversa ativa antes de checar keywords.
//
// Motivo: `findAgentForLine` checa `routing_criteria.keywords` em TODA mensagem.
// Em follow-ups ("Paris", "sim", "500 reais"), o cliente não repete "cotação" e a
// mensagem cai em `no_agent_configured`. Julia (n8n) não tinha esse problema porque
// fazia routing só na primeira msg e daí em diante seguia o mesmo fluxo.
//
// Solução: se o telefone já tem uma `ai_conversations` ativa/waiting (atualizada
// nas últimas 24h) com `current_agent_id` conhecido, carregar esse agente direto
// e pular a checagem de keyword. Respeita routing_filter por linha (para não
// vazar em ambiente de teste).
// ---------------------------------------------------------------------------
async function findAgentByActiveConversation(
  supabase: SupabaseClient,
  senderPhone: string | undefined,
  phoneNumberId: string | undefined,
): Promise<AgentConfig | null> {
  if (!senderPhone || !phoneNumberId) return null;
  const normalized = normalizePhone(senderPhone);
  if (!normalized) return null;

  // 1. Achar contatos pelo telefone (pode haver em múltiplas orgs — filtramos depois)
  const { data: contacts } = await supabase
    .from("contatos")
    .select("id, org_id")
    .eq("telefone", normalized)
    .limit(10);

  if (!contacts || contacts.length === 0) return null;
  const contactIds = contacts.map((c: { id: string }) => c.id);

  // 2. Conversa ativa para esse contato + linha, atualizada nas últimas 24h
  const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: convs } = await supabase
    .from("ai_conversations")
    .select("current_agent_id, updated_at, phone_number_id, org_id")
    .in("contact_id", contactIds)
    .in("status", ["active", "waiting"])
    .gte("updated_at", cutoff)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (!convs || convs.length === 0) return null;

  // Preferir conversa na mesma linha. Tolera conversas legadas sem phone_number_id.
  const candidate =
    convs.find((c: { phone_number_id?: string | null }) => c.phone_number_id === phoneNumberId)
    || convs.find((c: { phone_number_id?: string | null }) => !c.phone_number_id);

  if (!candidate?.current_agent_id) return null;

  // 3. Carregar agente completo + config da linha (respeitar routing_filter e ativa)
  const { data: agentRow } = await supabase
    .from("ai_agents")
    .select(`
      id, org_id, nome, tipo, modelo, temperature, max_tokens,
      system_prompt, persona, routing_criteria, escalation_rules,
      memory_config, fallback_message,
      n8n_webhook_url, template_id, is_template_based, ativa,
      handoff_signals, intelligent_decisions, prompts_extra,
      pipeline_models, timings, validator_rules,
      test_mode_phone_whitelist, multimodal_config,
      handoff_actions,
      playbook_enabled, identity_config, voice_config, boundaries_config
    `)
    .eq("id", candidate.current_agent_id)
    .eq("ativa", true)
    .maybeSingle();

  if (!agentRow) return null;

  // 4. Validar que a linha está ligada nesse agente e respeitar routing_filter
  const { data: lineRow } = await supabase
    .from("whatsapp_linha_config")
    .select("id")
    .eq("phone_number_id", phoneNumberId)
    .eq("ativo", true)
    .maybeSingle();

  if (!lineRow) return null;

  const { data: phoneLine } = await supabase
    .from("ai_agent_phone_line_config")
    .select("routing_filter, ativa")
    .eq("phone_line_id", lineRow.id)
    .eq("agent_id", agentRow.id)
    .eq("ativa", true)
    .maybeSingle();

  if (!phoneLine) return null;

  const filter = (phoneLine as { routing_filter?: { allowed_phones?: string[] } | null }).routing_filter;
  const allowed = filter?.allowed_phones;
  if (allowed && allowed.length > 0) {
    const allowedNormalized = allowed.map(normalizePhone);
    if (!allowedNormalized.includes(normalized)) {
      console.log(
        `[findAgentByActiveConversation] sender ${normalized} blocked by routing_filter for agent ${agentRow.id}`,
      );
      return null;
    }
  }

  console.log(
    `[findAgentByActiveConversation] matched active conversation for ${normalized} → agent ${agentRow.nome} (bypass keyword)`,
  );
  return agentRow as unknown as AgentConfig;
}

// ---------------------------------------------------------------------------
// 2. Load Agent Config (business, qualification, scenarios)
// ---------------------------------------------------------------------------

// Monta a linha de taxa respeitando o pricing_model. Se o usuário escreveu uma frase
// customizada (pricing_json.message), usa ela diretamente — senão sintetiza a partir
// dos campos estruturados. Retorna string vazia quando o agente não deve falar de preço
// (sem modelo configurado, modelo 'free' ou timing 'never').
function buildFeeMessage(business: BusinessConfig | null): string {
  if (!business) return "";
  const model = (business as { pricing_model?: string | null }).pricing_model ?? null;
  if (model === null || model === "free") return "";

  const pj = (business.pricing_json ?? {}) as Record<string, unknown>;
  const custom = typeof pj.message === "string" ? pj.message.trim() : "";
  if (custom) return custom;

  switch (model) {
    case "flat":
      return `Taxa: ${(pj.fee as number | string | undefined) ?? "a combinar"} ${(pj.currency as string | undefined) ?? "BRL"}`;
    case "percentage":
      return `Taxa: ${(pj.percent as number | string | undefined) ?? "?"}% sobre ${(pj.basis as string | undefined) ?? "o valor"}`;
    case "tiered": {
      const tiers = (pj.tiers as Array<{ label?: string; min?: number; max?: number | null; fee?: number }> | undefined) ?? [];
      if (tiers.length === 0) return "Taxa varia por faixa (consultar base de conhecimento).";
      const currency = (pj.currency as string | undefined) ?? "BRL";
      const list = tiers.map(t => {
        const range = t.label || (t.max != null ? `${t.min ?? 0}–${t.max}` : `a partir de ${t.min ?? 0}`);
        return `${range}: ${t.fee ?? "?"} ${currency}`;
      }).join("; ");
      return `Taxa por faixa — ${list}`;
    }
    case "custom":
      return "Valor sob cotação (explicar caso a caso, sem comprometer número).";
    default:
      return "";
  }
}

// Monta a seção de "Contexto do negócio" a partir dos blocos customizados que o
// admin configurou. Cada bloco tem título + conteúdo livre — é a forma do editor
// ensinar conceitos específicos do domínio (vagas ativas, convênios, SLA, etc)
// que não se encaixam nos campos estruturados. Retorna vazio quando não há blocos.
function buildCustomBlocksText(business: BusinessConfig | null): string {
  const blocks = (business?.custom_blocks ?? []).filter(b => b && (b.title?.trim() || b.content?.trim()));
  if (blocks.length === 0) return "";
  const sections = blocks.map(b => {
    const title = b.title?.trim() || "Bloco";
    const content = b.content?.trim() || "";
    return `### ${title}\n${content}`;
  }).join("\n\n");
  return `\n## CONTEXTO DO NEGÓCIO\nInformações que você deve conhecer e usar ao responder. Traga esses fatos quando forem relevantes, mas nunca copie literal — reformule conversacionalmente.\n\n${sections}\n`;
}

// Default conservador quando nenhum registro existe em ai_agent_business_config.
// Mantém comportamento razoável para agentes criados fora do wizard (ex: Luna pré-seed).
function defaultBusinessConfig(agent: AgentConfig): BusinessConfig {
  return {
    company_name: agent.nome ?? null,
    company_description: null,
    tone: null,
    language: "pt-BR",
    pricing_model: null,
    pricing_json: {},
    fee_presentation_timing: "never",
    process_steps: [],
    methodology_text: null,
    calendar_system: "supabase_rpc",
    calendar_config: { rpc_name: "agent_check_calendar" },
    protected_fields: ["pessoa_principal_id", "produto_data", "valor_estimado", "contato.telefone"],
    auto_update_fields: [],
    contact_update_fields: [
      "nome", "sobrenome", "email", "cpf", "passaporte", "data_nascimento", "endereco", "observacoes",
    ],
    form_data_fields: [],
    has_secondary_contacts: false,
    secondary_contact_role_name: "traveler",
    secondary_contact_fields: [],
    escalation_triggers: [],
    custom_blocks: [],
  };
}

// Deriva stages de qualificação dos gates declarados em intelligent_decisions.criar_reuniao
// quando a tabela ai_agent_qualification_flow está vazia.
function deriveQualificationFromGates(agent: AgentConfig): QualificationStage[] {
  const decision = agent.intelligent_decisions?.criar_reuniao;
  const gates = (decision?.config?.gates as string[] | undefined) ?? [];
  if (gates.length === 0) return [];
  return gates.map((gate, i) => ({
    stage_order: i + 1,
    stage_name: gate,
    stage_key: gate,
    question: `Confirme ${gate}.`,
    subquestions: [],
    disqualification_triggers: [],
    advance_to_stage_id: null,
    advance_condition: null,
    response_options: null,
    maps_to_field: null,
    skip_if_filled: true,
  }));
}

async function loadAgentConfig(
  supabase: SupabaseClient,
  agentId: string,
  agent?: AgentConfig,
) {
  const [bizRes, qualRes, scenarioRes, presentationsRes] = await Promise.all([
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
    supabase
      .from("ai_agent_presentations")
      .select("*")
      .eq("agent_id", agentId)
      .eq("enabled", true),
  ]);

  const business = (bizRes.data as BusinessConfig | null)
    || (agent ? defaultBusinessConfig(agent) : null);

  const qualificationRaw = (qualRes.data as QualificationStage[]) || [];
  const qualification = qualificationRaw.length > 0
    ? qualificationRaw
    : (agent ? deriveQualificationFromGates(agent) : []);

  if (!bizRes.data || qualificationRaw.length === 0) {
    console.log(
      `[loadAgentConfig] agent=${agentId} fallback_applied business=${!bizRes.data} qualification=${qualificationRaw.length === 0}`,
    );
  }

  return {
    business,
    qualification,
    scenarios: (scenarioRes.data as SpecialScenario[]) || [],
    presentations: (presentationsRes.data as AiAgentPresentation[]) || [],
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
  memoryConfig?: Record<string, unknown> | null,
): Promise<ConversationContext> {
  // memory_config do agente: max_history_turns (limite total) e short_term_turns
  // (window do compacto). Defaults batem com comportamento legado (50/8).
  const maxHistoryTurns = (memoryConfig?.max_history_turns as number) ?? 50;
  const shortTermTurns = (memoryConfig?.short_term_turns as number) ?? 8;
  // Carregar mensagens WhatsApp do contato (como Julia faz)
  const { data: contact } = await supabase
    .from("contatos")
    .select("id, nome, sobrenome, email, cpf, passaporte, data_nascimento")
    .eq("id", contactId)
    .single();

  // Detectar contato + papel: tenta primeiro como contato PRINCIPAL do card
  // (cards.pessoa_principal_id). Se não achar, busca como SECUNDÁRIO via junction
  // cards_contatos (schema real — `contatos` não tem coluna pessoa_principal_id).
  // Essa detecção define contactRole="primary"|"traveler" usado pelo prompt.
  const { data: primaryCards } = await supabase
    .from("cards")
    .select("id, titulo, pipeline_stage_id, ai_resumo, ai_contexto, dono_atual_id, sdr_owner_id, produto_data, estado_operacional, ai_responsavel, ai_pause_config, pessoa_principal_id")
    .eq("pessoa_principal_id", contactId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .neq("estado_operacional", "encerrado")
    .order("created_at", { ascending: false })
    .limit(1);

  let cardRow = primaryCards?.[0] || null;
  let contactRole = "primary";

  if (!cardRow) {
    const { data: junction } = await supabase
      .from("cards_contatos")
      .select("card_id")
      .eq("contato_id", contactId)
      .limit(10);
    const secondaryCardIds = (junction || []).map((j: { card_id: string }) => j.card_id);
    if (secondaryCardIds.length > 0) {
      const { data: secCards } = await supabase
        .from("cards")
        .select("id, titulo, pipeline_stage_id, ai_resumo, ai_contexto, dono_atual_id, sdr_owner_id, produto_data, estado_operacional, ai_responsavel, ai_pause_config, pessoa_principal_id")
        .in("id", secondaryCardIds)
        .is("archived_at", null)
        .is("deleted_at", null)
        .neq("estado_operacional", "encerrado")
        .order("created_at", { ascending: false })
        .limit(1);
      if (secCards && secCards.length > 0) {
        cardRow = secCards[0];
        contactRole = "traveler";
      }
    }
  }

  const card = cardRow
    ? { ...cardRow, responsavel_id: cardRow.dono_atual_id || cardRow.sdr_owner_id || null }
    : null;

  // Buscar historico de turns da conversa AI — limite respeitado de memory_config
  const { data: turns } = await supabase
    .from("ai_conversation_turns")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(maxHistoryTurns);

  // Reverter para ordem cronológica ascending (limit pegou os mais recentes)
  const msgs = (turns || []).reverse();

  // Formatar historico (como Julia: "DD/MM/YY_HH:MM_[who]: [msg]")
  const historico = msgs
    .map((m) => {
      const d = new Date(m.created_at);
      const ts = `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}_${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      const who = m.role === "user" ? "lead" : "owner";
      return `${ts}_[${who}]: ${m.content}`;
    })
    .join("\n");

  const historico_compacto = msgs.slice(-shortTermTurns)
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

  // contactRole foi detectado acima (primary vs traveler via junction cards_contatos).
  // Se traveler, buscar o nome do contato principal do card (cards.pessoa_principal_id).
  let pessoaPrincipalNome: string | null = null;
  const cardPrincipalId = (card as { pessoa_principal_id?: string } | null)?.pessoa_principal_id;
  if (contactRole === "traveler" && cardPrincipalId) {
    const { data: principal } = await supabase
      .from("contatos")
      .select("nome, sobrenome")
      .eq("id", cardPrincipalId)
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

  // Flags de pausa: humano assumiu OU pause_permanently foi ligado por handoff anterior.
  // Prioridade: pause_permanently (mais explícito) > human_handling.
  const pausePermanent = Boolean(
    (card as { ai_pause_config?: { permanent?: boolean } } | null)?.ai_pause_config?.permanent,
  );
  const humanHandling = (card as { ai_responsavel?: string } | null)?.ai_responsavel === "humano";
  const cardPaused = Boolean(card && (pausePermanent || humanHandling));
  const cardPausedReason: 'human_handling' | 'pause_permanently' | null = pausePermanent
    ? 'pause_permanently'
    : humanHandling ? 'human_handling' : null;

  const isPrimeiroContato = msgs.length <= 1;

  // ---- Playbook v2: carrega last_moment_key do ai_conversation_state ----
  // Só faz sentido se algum agente v2 já rodou nessa conversa. readLastMomentKey
  // retorna null pra v1, sem impacto.
  const lastMomentKey = await readLastMomentKey(supabase, conversationId);

  // ---- Playbook v2: extrai última mensagem do lead do histórico ----
  // Usado pelo moment_detector pra matchesTrigger(keyword).
  const lastLeadMessageRaw = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].content ?? null;
    }
    return null;
  })();

  return {
    historico,
    historico_compacto,
    is_primeiro_contato: isPrimeiroContato,
    // Inbound puro: é a primeira vez que o agente responde este lead.
    // Outbound pós-formulário usa ai-agent-outbound-trigger, não passa por aqui.
    presentation_scenario: isPrimeiroContato ? 'first_contact_inbound' : null,
    last_message_who: lastWho as "lead" | "owner" | "",
    owner_first_message: hasOwner && !hasLead,
    first_lead_message_only: hasLead && !hasOwner,
    lead_replied_now: lastWho === "lead" && ownerBeforeLast,
    lead_spoke_this_run: lastWho === "lead",
    meeting_created_or_confirmed: meetingDetected,
    stage_signal: "",
    turn_count: msgs.filter((m) => m.role === "user").length,
    // contact_name_known: true se temos um nome real. Valores vazios ou
    // placeholders neutros ("Cliente", "Lead", "WhatsApp") contam como
    // desconhecido — o persona prompt instrui a IA a descobrir o nome na
    // conversa em vez de usar o placeholder literal (bug 2026-04-23 14:57).
    contact_name: [contact?.nome, contact?.sobrenome].filter(Boolean).join(" ") || "",
    contact_name_known: (() => {
      const raw = (contact?.nome || "").trim().toLowerCase();
      if (!raw) return false;
      return !["cliente", "lead", "whatsapp", "desconhecido"].includes(raw);
    })(),
    contact_email: contact?.email || "",
    contact_role: contactRole,
    contato_id: contactId,
    card_id: card?.id || null,
    card_titulo: card?.titulo || null,
    pipeline_stage_id: card?.pipeline_stage_id || null,
    ai_resumo: card?.ai_resumo || "",
    card_paused: cardPaused,
    card_paused_reason: cardPausedReason,
    ai_contexto: card?.ai_contexto || "",
    sdr_owner_id: card?.responsavel_id || null,
    pessoa_principal_nome: pessoaPrincipalNome,
    form_data: formData,
    // ---- Playbook v2 (Marco 2) ----
    last_moment_key: lastMomentKey,
    last_lead_message: lastLeadMessageRaw,
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
  // Tool de scoring — so fica ATIVA se o agente tem ai_agent_scoring_config.enabled=true.
  // Admin controla via UI (aba Pontuacao do AiAgentDetailPage). loadAgentTools checa e inclui condicionalmente.
  {
    type: "function",
    function: {
      name: "calculate_qualification_score",
      description: "Calcula o score de qualificacao do lead com base nas regras configuradas pelo admin (região/orçamento/sinais ou outras dimensões custom). Use quando tiver coletado dados suficientes pra saber se o lead está pronto pra próximo passo. Retorna score, threshold, se qualificou e o detalhamento.",
      parameters: {
        type: "object",
        properties: {
          inputs: {
            type: "object",
            description: "Objeto com os valores coletados na conversa. Cada chave é o nome da dimensao (regiao, valor_convidado, etc) ou do campo booleano (viagem_internacional). Ex: {\"regiao\": \"Caribe\", \"valor_convidado\": 3200, \"viagem_internacional\": true}",
            additionalProperties: true,
          },
        },
        required: ["inputs"],
      },
    },
  },
];

async function loadAgentTools(
  supabase: SupabaseClient,
  agentId: string,
): Promise<ToolDefinition[]> {
  // 1. Carrega skills ativas do agente (como antes)
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

  // 2. Checa se scoring esta ativo pro agente (generico, serve pra qualquer agente)
  let scoringEnabled = false;
  try {
    const { data: scoringCfg, error: scoringErr } = await supabase
      .from("ai_agent_scoring_config")
      .select("enabled")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (!scoringErr && scoringCfg?.enabled === true) {
      scoringEnabled = true;
    }
  } catch (e) {
    // Tabela pode nao existir em alguns ambientes — ignora silenciosamente
    console.warn(`[loadAgentTools] ai_agent_scoring_config check falhou:`, (e as Error).message);
  }

  // 3. Se nao tem skills explicitamente configuradas, usa set completo
  //    (so adiciona scoring se enabled=true, senao tira)
  if (enabledNames.size === 0) {
    console.log(`[loadAgentTools] agente ${agentId} sem skills configuradas — fallback BUILT_IN_TOOLS (scoring: ${scoringEnabled})`);
    return BUILT_IN_TOOLS.filter((t) =>
      t.function.name !== "calculate_qualification_score" || scoringEnabled
    );
  }

  // 4. Filtro normal: think sempre disponivel, scoring so se enabled, resto por skill config
  const filtered = BUILT_IN_TOOLS.filter((t) => {
    if (t.function.name === "think") return true;
    if (t.function.name === "calculate_qualification_score") return scoringEnabled;
    return enabledNames.has(t.function.name);
  });

  console.log(`[loadAgentTools] agente ${agentId}: ${filtered.length} tools ativas (skills: ${[...enabledNames].join(",")}; scoring: ${scoringEnabled})`);
  return filtered;
}

// Aplica as handoff_actions configuradas no agente quando request_handoff é chamada.
// Cada ação é best-effort: falhas individuais são logadas mas não abortam o fluxo,
// pois o handoff principal (ai_responsavel='humano') já foi registrado pela RPC.
// A mensagem de transição fica guardada no ctx para o formatter usar como override.
async function applyHandoffActions(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
): Promise<void> {
  const actions = agent.handoff_actions;
  if (!actions || !ctx.card_id) {
    ctx.handoff_triggered = true;
    return;
  }

  ctx.handoff_triggered = true;

  // 1. Mover card para etapa configurada
  if (actions.change_stage_id) {
    const { error: stageErr } = await supabase
      .from("cards")
      .update({ pipeline_stage_id: actions.change_stage_id, updated_at: new Date().toISOString() })
      .eq("id", ctx.card_id);
    if (stageErr) {
      console.warn(`[handoff_actions] change_stage_id failed:`, stageErr.message);
    } else {
      console.log(`[handoff_actions] card ${ctx.card_id} moved to stage ${actions.change_stage_id}`);
    }
  }

  // 2. Aplicar tag
  if (actions.apply_tag?.name) {
    const { error: tagErr } = await supabase.rpc("agent_assign_tag", {
      p_card_id: ctx.card_id,
      p_tag_name: actions.apply_tag.name,
      p_tag_color: actions.apply_tag.color || "#f59e0b",
    });
    if (tagErr) {
      console.warn(`[handoff_actions] apply_tag failed:`, tagErr.message);
    } else {
      console.log(`[handoff_actions] tag "${actions.apply_tag.name}" applied to card ${ctx.card_id}`);
    }
  }

  // 3. Notificar o responsável
  if (actions.notify_responsible && ctx.sdr_owner_id) {
    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: ctx.sdr_owner_id,
      type: "ai_handoff",
      title: `${agent.nome} pediu handoff`,
      body: `Conversa com ${ctx.contact_name || "contato"} precisa de humano no card "${ctx.card_titulo || ctx.card_id}".`,
      card_id: ctx.card_id,
      org_id: agent.org_id,
      metadata: { source: "ai_agent_router", agent_id: agent.id },
    });
    if (notifErr) {
      console.warn(`[handoff_actions] notify_responsible failed:`, notifErr.message);
    }
  }

  // 4. Pause permanently — marcar no card via flag em ai_pause_config (se coluna existir).
  //    Atualmente ai_responsavel='humano' já pausa o agente até alguém zerar. Se a empresa
  //    quer pause permanente, gravamos a flag para evitar que um fluxo automático
  //    (ex: novo card) reative o agente sem intervenção humana.
  if (actions.pause_permanently) {
    const { error: pauseErr } = await supabase
      .from("cards")
      .update({
        ai_pause_config: { permanent: true, reason: "handoff_permanent", paused_at: new Date().toISOString() },
      })
      .eq("id", ctx.card_id);
    if (pauseErr && !pauseErr.message.includes("ai_pause_config")) {
      console.warn(`[handoff_actions] pause_permanently failed:`, pauseErr.message);
    }
  }
}

async function executeToolCall(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  ctx: ConversationContext,
  agent: AgentConfig,
  business?: BusinessConfig | null,
): Promise<string> {
  const startTime = Date.now();
  let result = "";

  // G5: registrar tool chamada no ctx para persistir em ai_conversation_turns.skills_used
  if (!ctx.skills_used_this_turn) ctx.skills_used_this_turn = [];
  if (!ctx.skills_used_this_turn.includes(toolName)) {
    ctx.skills_used_this_turn.push(toolName);
  }

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
        // Guard: card sem dono → a RPC responderia "Consultor" genérico e
        // o agente ofereceria horários de ninguém. Melhor parar aqui, instruir
        // o agente a não prometer horário e pedir handoff pra que um humano
        // assuma o card antes de marcar reunião.
        if (!ctx.sdr_owner_id) {
          result = JSON.stringify({
            error: "no_owner_assigned",
            guidance: "Este card ainda não tem um consultor responsável. Não prometa horário nem proponha reunião agora. Colete contexto do cliente e peça handoff (request_handoff) para que alguém do time assuma e marque a reunião depois.",
          });
          break;
        }
        // calendar_config.rpc_name permite trocar a RPC sem editar código (ex: novo provider)
        const calendarRpc = (business?.calendar_config as { rpc_name?: string } | undefined)?.rpc_name
          || "agent_check_calendar";
        const { data: calResult } = await supabase.rpc(calendarRpc, {
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
        const { data: tagResult, error: tagErr } = await supabase.rpc("agent_assign_tag", {
          p_card_id: ctx.card_id,
          p_tag_name: args.tag_name as string,
          p_tag_color: (args.tag_color as string) || "#3B82F6",
        });
        result = tagErr
          ? JSON.stringify({ error: tagErr.message })
          : JSON.stringify(tagResult || { success: true });
        break;
      }

      case "request_handoff": {
        // G4 fix — quando lead ainda não tem card, o handoff antes falhava silenciosamente
        // com `{"error":"Sem card associado"}` e o LLM mandava "vou verificar e te retorno"
        // sem ninguém ser notificado. Agora: sinaliza `ctx.handoff_triggered=true` mesmo sem
        // card, para o transition_message / fallback pegarem, e marca a conversa para
        // humano cuidar.
        if (!ctx.card_id) {
          const reason = (args.reason as string) || "pedido_humano_sem_card";
          const summary = (args.context_summary as string) || "Agente pediu handoff mas lead ainda não tem card.";
          console.warn(
            `[request_handoff] sem card associado — escalando via conversation. agent=${agent.nome} contact=${ctx.contato_id}`,
          );

          // Marcar ctx pra transition_message/override kick in
          ctx.handoff_triggered = true;

          // Marcar a conversa como "aguardando humano" para não continuar respondendo
          // automático. Campos: status=waiting, escalation_reason, escalation_at.
          try {
            await supabase
              .from("ai_conversations")
              .update({
                status: "waiting",
                escalation_reason: reason,
                escalation_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("contact_id", ctx.contato_id)
              .eq("current_agent_id", agent.id)
              .in("status", ["active", "waiting"]);
          } catch (convErr) {
            console.warn(`[request_handoff] conversation escalation update failed:`, convErr);
          }

          // Se o agente configurou notify_responsible, tentar notificar algum admin/SDR da org
          if (agent.handoff_actions?.notify_responsible) {
            try {
              // profiles.org_id aponta pra account pai em workspace filho — usar org_members
              const { data: admins } = await supabase
                .from("org_members")
                .select("user_id, profiles!inner(id, is_admin)")
                .eq("org_id", agent.org_id)
                .eq("profiles.is_admin", true)
                .limit(5);
              if (admins && admins.length > 0) {
                const notifications = admins.map((a: { user_id: string }) => ({
                  user_id: a.user_id,
                  type: "ai_handoff",
                  title: `${agent.nome} pediu handoff (sem card)`,
                  body: `Contato ${ctx.contact_name || "desconhecido"} pediu humano antes de criar card. Motivo: ${reason}`,
                  org_id: agent.org_id,
                  metadata: { source: "ai_agent_router", agent_id: agent.id, context_summary: summary },
                }));
                await supabase.from("notifications").insert(notifications);
              }
            } catch (notifErr) {
              console.warn(`[request_handoff] admin notify failed:`, notifErr);
            }
          }

          result = JSON.stringify({
            success: true,
            escalated_via: "conversation",
            note: "Handoff registrado na conversa. Card será criado pelo humano ao assumir.",
          });
          break;
        }
        const { data: handoffResult, error: handoffErr } = await supabase.rpc("agent_request_handoff", {
          p_card_id: ctx.card_id,
          p_reason: args.reason as string,
          p_context_summary: args.context_summary as string,
        });
        result = handoffErr
          ? JSON.stringify({ error: handoffErr.message })
          : JSON.stringify(handoffResult || { success: true });

        // Aplicar handoff_actions configuradas (safety net). Falhas individuais
        // são logadas mas não interrompem — handoff principal já foi registrado
        // e ai_responsavel='humano' pausa o agente.
        const ok = !handoffErr && (handoffResult as { success?: boolean } | null)?.success !== false;
        if (ok) {
          await applyHandoffActions(supabase, agent, ctx);
        }
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

      case "calculate_qualification_score": {
        // Tool generica de scoring. Chama a RPC calculate_agent_qualification_score
        // que le as regras de ai_agent_scoring_rules do agente, aplica aos inputs,
        // e retorna {score, threshold, qualificado, breakdown}.
        //
        // Inputs esperados: { inputs: { dimensao1: valor, dimensao2: valor, ... } }
        // Ex: { inputs: { regiao: "Caribe", valor_convidado: 3200, viagem_internacional: true } }
        //
        // Se scoring_config.enabled=false, RPC retorna {enabled: false} e agente entende
        // que feature nao esta ativa — nao deve insistir em calcular.
        try {
          const inputs = (args.inputs ?? {}) as Record<string, unknown>;
          const { data, error } = await supabase.rpc("calculate_agent_qualification_score", {
            p_agent_id: agent.id,
            p_inputs: inputs,
          });
          if (error) {
            console.warn(`[calculate_qualification_score] RPC error:`, error.message);
            result = JSON.stringify({ error: "Nao foi possivel calcular score no momento" });
          } else {
            result = JSON.stringify(data);
          }
        } catch (err) {
          console.warn(`[calculate_qualification_score] exception:`, (err as Error).message);
          result = JSON.stringify({ error: "Erro interno ao calcular score" });
        }
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
  business?: BusinessConfig | null,
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

      const toolResult = await executeToolCall(supabase, fnName, fnArgs, ctx, agent, business);

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
  supabase: SupabaseClient,
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

  // Agent.prompts_extra.context tem prioridade (paridade Julia).
  // Se vazio, cai no hardcoded default.
  const customContext = agent.prompts_extra?.context;
  const roleLabel = secondaryRoleLabel(business);
  const roleLabelCap = roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1);

  // ---- Playbook v2: bloco extra pra classificar momento ----
  // Quando agent.playbook_enabled=true, carregamos os momentos configurados
  // e pedimos ao Backoffice pra classificar current_moment_key (usado pelo
  // moment_detector como fallback quando determinístico não bate). Zero
  // impacto em agentes v1 — bloco fica vazio e JSON espera só campos v1.
  let playbookMomentsBlock = "";
  let playbookJsonExtra = "";
  if (agent.playbook_enabled === true) {
    try {
      const moments = await loadPlaybookMoments(supabase, agent.id);
      if (moments.length > 0) {
        const lines = moments
          .map((m, i) => `  ${i + 1}. ${m.moment_key} — ${m.moment_label}`)
          .join("\n");
        playbookMomentsBlock = `

## Playbook — momentos desta conversa
${lines}

Último momento registrado: ${ctx.last_moment_key ?? "(nenhum)"}

Classifique qual desses moment_keys descreve melhor o momento ATUAL da conversa.
Regras: (1) Em primeiro contato, retorne o momento com trigger primeiro_contato ou display_order=1.
(2) Nunca pule momentos sem razão clara — prefira o mais atrasado quando em dúvida.
(3) Se o lead introduziu objeção/pergunta específica (preço, lua de mel, etc), pode pular
pro momento correspondente.`;
        playbookJsonExtra = `,
  "current_moment_key": "<moment_key_classificado>",
  "moment_transition_reason": "<1 frase curta: por que esse momento>"`;
      }
    } catch (err) {
      console.warn("[runBackofficeAgent] playbook moments load failed:", err);
      // silencioso — se moments falha, backoffice continua em modo v1
    }
  }

  const dataBlock = `

## Dados deste turno (injetados pelo runtime)
- Histórico completo: ${ctx.historico}
- ai_resumo atual: ${ctx.ai_resumo || "(vazio)"}
- ai_contexto atual: ${ctx.ai_contexto || "(vazio)"}
- Papel do remetente (contact_role): ${ctx.contact_role}
- Nome: ${ctx.contact_name}
- Label do papel secundário: "${roleLabel}" (use esse termo ao referir-se a quem não é o cliente principal)${playbookMomentsBlock}

Responda SEMPRE em JSON único conforme a saída pedida acima.`;

  const prompt = customContext && customContext.trim().length > 80
    ? customContext + dataBlock
    : `Voce e um analista de backoffice que consolida fatos do cliente.

Dados:
- Historico: ${ctx.historico}
- Resumo atual: ${ctx.ai_resumo || "(vazio)"}
- Contexto atual: ${ctx.ai_contexto || "(vazio)"}
- Role do contato: ${ctx.contact_role}
- Nome: ${ctx.contact_name}

REGRAS:
1. Atualize ai_resumo APENAS com fatos EXPLICITAMENTE ditos pelo cliente
2. Atualize ai_contexto com sequencia cronologica dos eventos
3. Se contact_role = "traveler": prefixe com [${roleLabelCap}: ${ctx.contact_name}]
4. NUNCA invente, infira ou assuma
5. Se nada mudou, mantenha textos identicos ao atual
6. Em primeiro contato generico: NAO altere ai_resumo, apenas ai_contexto

Resposta OBRIGATORIA em JSON:
{
  "ai_resumo": "<texto final>",
  "ai_contexto": "<texto final>",
  "detected_role": "primary"|"traveler",
  "mudancas": { "ai_resumo": true|false, "ai_contexto": true|false }${playbookJsonExtra}
}`;

  const contextModel = agent.pipeline_models?.context?.model || agent.modelo;
  const contextTemp = agent.pipeline_models?.context?.temperature ?? 0.3;
  const contextMaxTok = agent.pipeline_models?.context?.max_tokens ?? 1024;

  try {
    const { response } = await callLLM(
      contextModel, contextTemp, contextMaxTok,
      prompt, ctx.historico_compacto,
    );
    const parsed = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    return {
      ai_resumo: parsed.ai_resumo || ctx.ai_resumo,
      ai_contexto: parsed.ai_contexto || ctx.ai_contexto,
      detected_role: parsed.detected_role || ctx.contact_role,
      mudancas: parsed.mudancas || { ai_resumo: false, ai_contexto: false },
      // ---- Playbook v2: campos opcionais ----
      current_moment_key: parsed.current_moment_key ?? null,
      moment_transition_reason: parsed.moment_transition_reason ?? null,
    };
  } catch (err) {
    console.error("Backoffice agent error:", err);
    return {
      ai_resumo: ctx.ai_resumo,
      ai_contexto: ctx.ai_contexto,
      detected_role: ctx.contact_role,
      mudancas: { ai_resumo: false, ai_contexto: false },
      current_moment_key: null,
      moment_transition_reason: null,
    };
  }
}

// ---------------------------------------------------------------------------
// 8. Pipeline Step: Data Agent
// ---------------------------------------------------------------------------

/**
 * Resultado do Data Agent consumido pelo Persona Agent.
 *
 * qualificationSignals: inferências do LLM sobre o histórico recente, mesmo
 * quando o Data Agent não tem certeza pra persistir. Permite o Persona pular
 * perguntas cuja resposta já está na conversa mas ainda não virou campo
 * persistido (gap que existia antes da Frente E).
 */
export interface DataAgentResult {
  qualificationSignals: Record<string, string>;
}

async function runDataAgent(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
): Promise<DataAgentResult> {
  if (!agent.is_template_based || !ctx.card_id) return { qualificationSignals: {} };

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

  // 3. Data Agent LLM — extrai dados estruturados + sinais de qualificação.
  // Se viajante, só atualiza dados pessoais do próprio viajante (não avança stage, não edita titulo).
  try {
    return await runDataAgentLLM(supabase, agent, ctx, backoffice, business, qualification);
  } catch (err) {
    console.error("[runDataAgentLLM] error (non-fatal):", err);
    return { qualificationSignals: {} };
  }
}

async function runDataAgentLLM(
  supabase: SupabaseClient,
  agent: AgentConfig,
  ctx: ConversationContext,
  backoffice: BackofficeOutput,
  business: BusinessConfig | null,
  qualification: QualificationStage[],
): Promise<DataAgentResult> {
  if (!ctx.card_id) return { qualificationSignals: {} };

  const isTraveler = backoffice.detected_role === "traveler";
  const protectedFields = business?.protected_fields || ["pessoa_principal_id", "produto_data", "valor_estimado", "created_at", "created_by"];

  const stagesOpts = qualification
    .filter((s) => s.advance_to_stage_id)
    .map((s) => `  - "${s.advance_to_stage_id}" (${s.stage_name}${s.advance_condition ? `, condicao: ${s.advance_condition}` : ""})`)
    .join("\n");

  // ── Frente A: whitelist dinâmica ──
  // Fonte única: auto_update_fields do business_config (o admin seleciona pelo picker).
  // Default sugerido só quando admin não configurou nada. RPC agent_update_card_data_v2
  // valida de novo contra system_fields e protected_fields antes de escrever.
  const autoUpdateFields = business?.auto_update_fields || [];
  const defaultSugestao = ["titulo", "ai_resumo", "ai_contexto", "pipeline_stage_id"];
  const configuredCardFields = autoUpdateFields.length > 0 ? autoUpdateFields : defaultSugestao;

  // Traveler hard-lock: mesmo que admin tenha liberado titulo/stage, viajante não pode mexer.
  const travelerAllowed = new Set(["ai_resumo", "ai_contexto"]);
  const allowedCardFields = isTraveler
    ? configuredCardFields.filter((f) => travelerAllowed.has(f))
    : configuredCardFields;

  // contact_update_fields do business_config se configurado, senão default razoável
  const configContactFields = business?.contact_update_fields || [];
  const defaultContactFields = isTraveler
    ? ["cpf", "passaporte", "data_nascimento", "email", "observacoes"]
    : ["nome", "sobrenome", "email", "cpf", "passaporte", "data_nascimento", "observacoes"];
  const allowedContactFields = configContactFields.length > 0
    ? (isTraveler
        ? configContactFields.filter((f) => ["cpf","passaporte","data_nascimento","email","observacoes"].includes(f))
        : configContactFields)
    : defaultContactFields;

  const customData = agent.prompts_extra?.data_update;
  const dataBlock = `

## Dados deste turno (injetados pelo runtime)
- Card ID: ${ctx.card_id}
- Contato ID: ${ctx.contato_id}
- Role: ${isTraveler ? "traveler" : "primary"}
- Stage atual: ${ctx.pipeline_stage_id || "(nao definido)"}
- ai_resumo atual: ${backoffice.ai_resumo || "(vazio)"}
- ai_contexto atual: ${backoffice.ai_contexto || "(vazio)"}
- Sinais: first_lead_message_only=${ctx.first_lead_message_only}, lead_replied_now=${ctx.lead_replied_now}, meeting_created_or_confirmed=${ctx.meeting_created_or_confirmed}
- Stages disponíveis para avanço:
${stagesOpts || "(nenhum stage configurado)"}
- Campos PROTEGIDOS (não tocar): ${protectedFields.join(", ")}
- Campos permitidos no card: ${allowedCardFields.join(", ")}
- Campos permitidos no contato: ${allowedContactFields.join(", ")}
- Histórico:
${ctx.historico_compacto}

Responda OBRIGATORIAMENTE em JSON: { "card_patch": {...}, "contact_patch": {...}, "qualification_signals": {...}, "reasoning": "..." }`;

  const prompt = customData && customData.trim().length > 80
    ? customData + dataBlock
    : `Voce e o Agente de Dados. Sua tarefa: ler a conversa e decidir se ha dados novos e COMPROVAVEIS pra gravar no CRM. Nao conversa, so decide.

## Contexto
- Card ID: ${ctx.card_id}
- Contato ID: ${ctx.contato_id}
- Role: ${isTraveler ? `traveler (${secondaryRoleLabel(business)} — NAO avance stage, NAO edite titulo, so dados pessoais do ${secondaryRoleLabel(business)})` : "primary"}
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
- data_nascimento / data_viagem_inicio / data_viagem_fim: YYYY-MM-DD.
- nome/sobrenome: primeira letra maiuscula.
- Campos dinamicos permitidos em "Campos permitidos no card" (ex: mkt_destino, ww_sdr_ajuda_familia): grave quando o cliente indicou explicitamente.

### Avanco de stage (so se NAO for traveler)
- Use advance_to_stage_id da lista acima quando a condicao da conversa bater claramente (cliente confirmou reuniao, respondeu primeira vez, etc).
- Se ja ha sinal deterministico que avançou, NAO tente avançar de novo.

### qualification_signals (Frente E — sinais para o Persona nao re-perguntar)
Alem do que vai ser GRAVADO, liste aqui sinais inferidos do historico mesmo quando
a certeza nao e suficiente pra gravar. Isso ajuda o Persona a nao re-perguntar o
que o cliente ja mencionou.
- Chave = nome do campo do CRM (ex: "mkt_destino", "mkt_pretende_viajar_quando").
- Valor = string breve do que o cliente indicou (ex: "Japão", "março de 2027").
- So inclua se houve menção clara. Deixe {} se nada.

## Saida (JSON exato)
{
  "card_patch": { "<campo>": <valor> } ou {},
  "contact_patch": { "<campo>": <valor> } ou {},
  "qualification_signals": { "<campo>": "<valor breve>" } ou {},
  "reasoning": "<1 frase explicando por que atualizou ou por que nao>"
}

Se nao ha nada COMPROVAVEL pra gravar, retorne card_patch e contact_patch vazios (qualification_signals ainda pode ter sinais).`;

  const dataModel = agent.pipeline_models?.data?.model || agent.modelo;
  const dataTemp = agent.pipeline_models?.data?.temperature ?? 0.1;
  const dataMaxTok = agent.pipeline_models?.data?.max_tokens ?? 800;

  let parsed: {
    card_patch?: Record<string, unknown>;
    contact_patch?: Record<string, unknown>;
    qualification_signals?: Record<string, string>;
    reasoning?: string;
  };
  try {
    const { response } = await callLLM(dataModel, dataTemp, dataMaxTok, prompt, ctx.historico_compacto || "(sem historico)");
    parsed = JSON.parse(response.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch (err) {
    console.warn("[runDataAgentLLM] parse failed:", err);
    return { qualificationSignals: {} };
  }

  const cardPatch = parsed.card_patch || {};
  const contactPatch = parsed.contact_patch || {};
  const qualificationSignals = (parsed.qualification_signals || {}) as Record<string, string>;

  if (Object.keys(cardPatch).length > 0) {
    // Filtrar campos bloqueados localmente antes do RPC (defesa em profundidade)
    if (isTraveler) {
      delete (cardPatch as Record<string, unknown>).pipeline_stage_id;
      delete (cardPatch as Record<string, unknown>).titulo;
    }
    const { data: updateResult, error: updateErr } = await supabase.rpc("agent_update_card_data", {
      p_card_id: ctx.card_id,
      p_patch: cardPatch,
      p_allowed_fields: allowedCardFields,
      p_protected_fields: protectedFields,
    });
    if (updateErr) {
      console.warn("[runDataAgentLLM] card update rpc error:", updateErr.message);
    } else {
      const r = updateResult as { ok?: boolean; updated_top?: string[]; updated_produto_data?: string[]; blocked?: Array<{ field: string; reason: string }> } | null;
      const top = r?.updated_top || [];
      const pd = r?.updated_produto_data || [];
      const blocked = r?.blocked || [];
      if (top.length + pd.length > 0) {
        console.log(`[runDataAgentLLM] card updated: top=${top.join(",")} produto_data=${pd.join(",")}`);
      }
      if (blocked.length > 0) {
        console.warn(`[runDataAgentLLM] blocked updates:`, JSON.stringify(blocked));
      }
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

  if (Object.keys(qualificationSignals).length > 0) {
    console.log(`[runDataAgentLLM] signals:`, JSON.stringify(qualificationSignals));
  }

  return { qualificationSignals };
}

// ---------------------------------------------------------------------------
// Apresentação configurável — helpers
// ---------------------------------------------------------------------------

/**
 * Resolve variáveis {{contact_name}}, {{agent_name}}, {{company_name}} e
 * {{form_field:<slug>}} no template. Var não-resolvida vira string vazia.
 * Alinhado com resolveTemplate do ai-agent-outbound-trigger.
 */
function resolvePresentationTemplate(
  template: string,
  ctx: ConversationContext,
  agent: AgentConfig,
  business: BusinessConfig | null,
): string {
  return template.replace(/\{\{(\w+(?::[\w-]+)?)\}\}/g, (_, key: string) => {
    if (key === "contact_name") return ctx.contact_name || "";
    if (key === "agent_name") return agent.nome || "";
    if (key === "company_name") return business?.company_name || "";
    if (key.startsWith("form_field:")) {
      const slug = key.split(":")[1];
      return ctx.form_data?.[slug] || "";
    }
    return "";
  });
}

/**
 * Monta bloco de apresentação pra injetar no personaPrompt quando o cenário
 * detectado em ctx.presentation_scenario tem linha habilitada. Retorna string
 * vazia quando não aplica — nesse caso, o prompt mantém a regra default
 * ("PRIMEIRO CONTATO: NAO se apresente novamente").
 */
function buildPresentationBlock(
  presentations: AiAgentPresentation[],
  ctx: ConversationContext,
  agent: AgentConfig,
  business: BusinessConfig | null,
): string {
  if (!ctx.presentation_scenario) return "";
  const row = presentations.find(
    (p) => p.scenario === ctx.presentation_scenario && p.enabled,
  );
  if (!row) return "";

  if (row.mode === "fixed" && row.fixed_template) {
    const resolved = resolvePresentationTemplate(row.fixed_template, ctx, agent, business);
    return `APRESENTACAO OBRIGATORIA (cenario: ${row.scenario}):
Esta e a PRIMEIRA vez que voce responde este lead. Sua PRIMEIRA mensagem deve ser EXATAMENTE:
"${resolved}"

Apos essa mensagem, siga as regras normais. Nao repita a apresentacao em mensagens seguintes.`;
  }

  if (row.mode === "faithful" && row.concept_text) {
    const resolved = resolvePresentationTemplate(row.concept_text, ctx, agent, business);
    return `APRESENTACAO FIEL (cenario: ${row.scenario}):
Esta e a PRIMEIRA vez que voce responde este lead. Siga FIELMENTE esta estrutura e conteudo:

"${resolved}"

O que voce PODE fazer:
- Adaptar para soar natural com o nome do lead (${ctx.contact_name || "sem nome ainda"}).
- Variar pequenas palavras de conexao (ex: "oi" vs "olá", "eu estou" vs "estou").
- Quebrar em ate 2 mensagens WhatsApp curtas se ficar mais natural.

O que voce NAO PODE fazer:
- Adicionar etapas, informacoes ou promessas que nao estao neste texto.
- Citar outras partes do prompt (processo, wedding planner, videoconferencia, prazo, preco) que nao aparecem aqui.
- Mudar o objetivo ou a estrutura geral da mensagem.
- Inventar beneficios, premios ou dados da empresa.

Apos essa primeira resposta, siga as regras normais e nao repita a apresentacao.`;
  }

  if (row.mode === "concept" && row.concept_text) {
    return `APRESENTACAO DESTE MOMENTO (cenario: ${row.scenario}):
Diretriz: ${row.concept_text.trim()}

Use esta diretriz como base pra abrir a conversa. Mantenha seu tom e persona.
Adapte ao nome do lead (${ctx.contact_name || "Cliente"}) e ao que voce sabe do formulario.
Nao cite "diretriz", "instrucao" ou "script". Soe natural.
Apos se apresentar, va direto ao que o lead precisa.`;
  }

  return "";
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
  qualificationSignals: Record<string, string> = {},
  presentations: AiAgentPresentation[] = [],
): Promise<{ response: string; inputTokens: number; outputTokens: number }> {

  // ═══════════════════════════════════════════════════════════════
  // Playbook v2 — guard com fail-safe. Se agente tem flag ativa,
  // delega pro runPersonaAgent_v2. Se falha, cai pro v1 abaixo.
  // Ponto de entrada único pra bifurcação — resto do pipeline
  // (backoffice, data, validator, formatter) continua igual pra v1 e v2.
  // ═══════════════════════════════════════════════════════════════
  if (agent.playbook_enabled === true) {
    try {
      const v2Result = await runPersonaAgent_v2(
        supabase,
        {
          id: agent.id,
          org_id: agent.org_id,
          nome: agent.nome,
          modelo: agent.modelo,
          temperature: agent.temperature,
          max_tokens: agent.max_tokens,
          playbook_enabled: agent.playbook_enabled ?? false,
          identity_config: agent.identity_config ?? null,
          voice_config: agent.voice_config ?? null,
          boundaries_config: agent.boundaries_config ?? null,
          pipeline_models: agent.pipeline_models ?? null,
        },
        {
          is_primeiro_contato: ctx.is_primeiro_contato,
          contact_name: ctx.contact_name,
          contact_name_known: ctx.contact_name_known,
          contact_role: ctx.contact_role,
          card_id: ctx.card_id,
          card_titulo: ctx.card_titulo,
          pipeline_stage_id: ctx.pipeline_stage_id,
          ai_resumo: backoffice.ai_resumo ?? ctx.ai_resumo,
          ai_contexto: backoffice.ai_contexto ?? ctx.ai_contexto,
          form_data: ctx.form_data,
          historico_compacto: ctx.historico_compacto,
          lead_replied_now: ctx.lead_replied_now,
          turn_count: ctx.turn_count,
          last_moment_key: ctx.last_moment_key ?? null,
          last_lead_message: ctx.last_lead_message ?? null,
        },
        {
          ai_resumo: backoffice.ai_resumo,
          ai_contexto: backoffice.ai_contexto,
          detected_role: backoffice.detected_role,
          current_moment_key: backoffice.current_moment_key ?? null,
          moment_transition_reason: backoffice.moment_transition_reason ?? null,
        },
        business ? {
          company_name: business.company_name ?? "",
          company_description: business.company_description ?? "",
          methodology_text: business.methodology_text ?? "",
        } : null,
        userMessage,
        qualificationSignals,
        async (model, temp, maxTok, sys, userMsg) => {
          return callLLM(model, temp, maxTok, sys, userMsg);
        },
      );

      // Anota metadata v2 no ctx pra o main handler persistir em ai_conversation_turns
      ctx.v2_current_moment_key = v2Result.v2Metadata.current_moment_key;
      ctx.v2_qualification_score_at_turn = v2Result.v2Metadata.qualification_score_at_turn;
      ctx.v2_moment_detection_method = v2Result.v2Metadata.moment_detection_method;
      ctx.v2_moment_transition_reason = v2Result.v2Metadata.moment_transition_reason;

      return {
        response: v2Result.response,
        inputTokens: v2Result.inputTokens,
        outputTokens: v2Result.outputTokens,
      };
    } catch (v2Err) {
      // Fail-safe: log + cai pro v1. Nunca deixa lead sem resposta.
      console.error(JSON.stringify({
        event: 'persona_v2_failsafe',
        agent_id: agent.id,
        card_id: ctx.card_id,
        error: String(v2Err),
        stack: (v2Err as Error)?.stack?.split('\n').slice(0, 5),
      }));
      // Continua pro fluxo v1 abaixo.
    }
  }

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
  // Frente E — Smart qualification: skip stages whose mapped field already has data.
  // Fonte combinada: form_data persistido (produto_data) + qualification_signals inferidos
  // do histórico da conversa pelo Data Agent. Isso resolve o caso "cliente disse Japão
  // mas ainda não foi gravado no card, e mesmo assim agente não re-pergunta".
  const knownValues: Record<string, string> = { ...ctx.form_data };
  for (const [k, v] of Object.entries(qualificationSignals)) {
    if (v && typeof v === "string" && v.trim().length > 0 && !knownValues[k]) {
      knownValues[k] = v;
    }
  }
  const activeQualification = qualification.filter((stage) => {
    if (!stage.maps_to_field || !stage.skip_if_filled) return true;
    const fieldValue = knownValues[stage.maps_to_field];
    return !fieldValue || fieldValue.trim() === "";
  });

  const qualStages = activeQualification
    .map((s) => `${s.stage_order}) ${s.question}${s.response_options ? ` [Opções: ${s.response_options.join(", ")}]` : ""}`)
    .join("\n");

  const disqualRules = activeQualification
    .flatMap((s) => s.disqualification_triggers)
    .map((d) => `- ${d.trigger}: "${d.message}"`)
    .join("\n");

  // Cenários são avaliados semanticamente pelo LLM a partir da trigger_description.
  // Quando um cenário se aplica, o agente segue o response_adjustment e chama os
  // tools correspondentes (assign_tag) pra executar as ações configuradas.
  const scenarioText = scenarios
    .map((s) => {
      const description = (s.trigger_description || "").trim();
      const header = description
        ? `[${s.scenario_name}] Quando: ${description}`
        : `[${s.scenario_name}]`;
      const actions: string[] = [];
      if (s.response_adjustment) actions.push(s.response_adjustment);
      if (s.skip_fee_presentation) actions.push("NAO apresente taxa.");
      if (s.skip_meeting_scheduling) actions.push("NAO agende reuniao.");
      if (s.auto_assign_tag) actions.push(`Chame assign_tag("${s.auto_assign_tag}") pra marcar o card.`);
      return `${header}\n  → ${actions.join(" ")}`;
    })
    .join("\n");

  // Apresentação configurável (ai_agent_presentations) — injeta bloco dedicado
  // quando ctx.presentation_scenario aponta um cenário E existe linha habilitada
  // pro agente. Modo 'fixed' → enviar EXATO (com vars); modo 'concept' → diretriz
  // que o LLM parafrasea mantendo persona. Fora do cenário, bloco vira "".
  const presentationBlock = buildPresentationBlock(presentations, ctx, agent, business);

  // Frente E — bloco "JÁ SABEMOS": combina form_data persistido + signals inferidos
  // pelo Data Agent do histórico. Persona usa pra NÃO re-perguntar o que cliente
  // já indicou, mesmo que ainda não tenha virado campo gravado.
  const knownEntries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(ctx.form_data)) {
    if (v) knownEntries.push([k, v as string]);
  }
  for (const [k, v] of Object.entries(qualificationSignals)) {
    if (v && !ctx.form_data[k]) knownEntries.push([k, `${v} (inferido da conversa)`]);
  }
  const formDataText = knownEntries.map(([k, v]) => `- ${k}: ${v}`).join("\n");

  const feeMsg = buildFeeMessage(business);
  const customBlocksText = buildCustomBlocksText(business);

  // Biblioteca de técnicas de vendas e antipadrões — destilada do prompt da Julia (Responde Lead)
  // Aplicável a qualquer agente de pré-venda SPIN/qualificação.
  const SALES_PLAYBOOK = `
## Biblioteca de técnicas (aplicar sempre que couber)

### SPIN (pergunta certa no momento certo)
- Se ainda não conhece o processo/contexto do cliente: pergunta de **Situação** ("como vocês se organizam hoje pra X?").
- Se já tem situação mas sem dor declarada: pergunta de **Problema** ("o que mais te incomoda nisso hoje?").
- Se há dor declarada: peça **Implicação concreta** ("e isso acaba afetando o que?") e costure dor + impacto em 1 linha.
- Se há impacto: peça número/prioridade. Se cliente relutar, ofereça faixas específicas em vez de números exatos.

### Antipadrões (EVITE sempre)
- **Justificar pergunta.** Em vez de "Pra te ajudar melhor, como vocês...", faça "Como vocês..." direto.
- **Inferir causa não dita.** Em vez de "Imagino que isso te atrapalhe muito", pergunte "Onde isso mais aperta?".
- **Empilhar perguntas desconexas.** Agrupar 2 perguntas relacionadas na mesma mensagem (ex: "destino e período?") é OK. O que não pode é jogar 3+ perguntas soltas sobre temas diferentes de uma vez.
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

  // C3 — sinais de handoff e decisões inteligentes (configuráveis por agente)
  const handoffBlock = buildHandoffBlock(agent);
  const decisionsBlock = buildDecisionsBlock(agent);
  // prompts_extra.context/data_update/formatting/validator alimentam os AGENTES
  // dedicados do pipeline (backoffice/data/formatter/validator). NÃO devem entrar
  // no persona — misturar polui o prompt com instruções de outros passos.

  // Processo do negócio em passos numerados (vem de business_config.process_steps)
  const processStepsBlock = business?.process_steps && business.process_steps.length > 0
    ? `\nNOSSO PROCESSO (nesta ordem):\n${business.process_steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  // Papel do agente: deriva do process_steps — agente executa o passo 1 (qualificação),
  // os demais passos são de outras pessoas (consultora, planner). Evita que o agente
  // se confunda e diga "eu vou montar sua viagem" quando na verdade é SDR.
  const rolePrinciple = business?.process_steps && business.process_steps.length > 1
    ? `\nSEU PAPEL (regra de ouro):\nVocê executa APENAS o passo 1 ("${business.process_steps[0]}"). Os passos seguintes (${business.process_steps.slice(1, 3).join(", ")}...) são responsabilidade de outras pessoas no time (consultora/planner/especialista). Se o cliente perguntar "você que vai montar/fazer X?", deixe claro: o que é seu (qualificar, tirar dúvidas, agendar reunião) vs o que vem depois (consultora dedicada que desenha e opera a viagem). NUNCA prometa entregar algo que é do passo 2+.`
    : "";

  // Campos que o agente pode coletar/atualizar no contato (vem de business_config.contact_update_fields)
  const contactUpdateFields = business?.contact_update_fields && business.contact_update_fields.length > 0
    ? business.contact_update_fields.join(", ")
    : "nome, sobrenome, email, cpf, passaporte, data_nascimento";

  // Campos protegidos que NUNCA podem ser atualizados (vem de business_config.protected_fields)
  const protectedFieldsBlock = business?.protected_fields && business.protected_fields.length > 0
    ? `\nCAMPOS PROTEGIDOS (NUNCA atualizar): ${business.protected_fields.join(", ")}`
    : "";

  // Instruções customizadas do agente — system_prompt editado pelo admin no CRM.
  // Vai como complemento ao persona dinâmico (regras finas de VIAJANTE, Club Med,
  // scripts específicos que não couberam nos campos estruturados).
  const customAgentInstructions = agent.system_prompt && agent.system_prompt.trim().length > 0
    ? `\n## INSTRUÇÕES CUSTOMIZADAS DO AGENTE\n${agent.system_prompt.trim()}`
    : "";

  const personaPrompt = `Voce e ${agent.nome}, ${agent.persona || "assistente"} da ${business?.company_name || "empresa"}.

Contexto:
- ai_resumo: ${backoffice.ai_resumo || "(vazio)"}
- ai_contexto: ${backoffice.ai_contexto || "(vazio)"}
${ctx.contact_name_known
  ? `- Nome: ${ctx.contact_name}`
  : `- Nome: DESCONHECIDO — voce NAO sabe o nome do lead ainda. NUNCA use "Cliente", "Lead" ou qualquer placeholder como se fosse o nome dele. Em vez disso, descubra o nome com naturalidade na conversa (ex: "pra eu te chamar pelo nome, como voce se chama?"). Ate saber, use cumprimento sem nome ("Oi, tudo bem?").`}
- Primeiro contato: ${ctx.is_primeiro_contato}
- Role: ${backoffice.detected_role}
- Card ID: ${ctx.card_id || "(sem card)"}
- Contato ID: ${ctx.contato_id}
${ctx.pessoa_principal_nome ? `- Nome principal: ${ctx.pessoa_principal_nome}` : ""}
${rolePrinciple}
${processStepsBlock}

${formDataText ? `JA SABEMOS (NAO RE-PERGUNTE):\n${formDataText}\nAntes de qualquer pergunta, verifique este bloco. Se ja tem os dados essenciais, pule qualificacao e apresente processo direto.\nNUNCA cite "formulario" ou "sistema".` : ""}

${backoffice.detected_role === "traveler" ? (() => {
  const roleLabel = secondaryRoleLabel(business);
  const roleLabelCap = roleLabel.charAt(0).toUpperCase() + roleLabel.slice(1);
  return `COMPORTAMENTO ${roleLabel.toUpperCase()}:
1. Cumprimente pelo nome do ${roleLabel}
2. Referencie "a ${business?.company_name?.toLowerCase().includes("wedding") ? "celebração" : "viagem"} com ${ctx.pessoa_principal_nome}"
3. NUNCA peca taxa/pagamento/reuniao
4. PODE coletar: ${business?.secondary_contact_fields?.join(", ") || "passaporte, CPF, data nascimento"}
5. NUNCA desqualifique ${roleLabelCap}`;
})() : ""}

${business?.methodology_text ? `O QUE OFERECEMOS:\n${business.methodology_text}` : ""}

${customBlocksText}

${qualStages ? `AINDA PERGUNTAR (so o que falta — ja filtrado pelo runtime):\n${qualStages}\nRegras: (1) Responda primeiro o que o cliente pediu em 1-2 frases. (2) Depois avance o proximo gap com uma pergunta objetiva; se dois gaps sao proximos (ex: destino + periodo, viajantes + ocasiao) pode agrupar numa pergunta so. Evite jogar 3+ perguntas soltas. (3) Se o cliente respondeu varios dados de uma vez, acuse recebido sem re-perguntar e va direto pro proximo gap. (4) Se o bloco "JA SABEMOS" cobriu tudo, pule qualificacao e apresente processo.` : ""}

${feeMsg && business?.fee_presentation_timing !== "never" ? `TAXA: ${feeMsg}\nApresentar: ${business?.fee_presentation_timing || "after_qualification"}` : ""}

${disqualRules ? `DESQUALIFICACAO (APENAS estes cenarios):\n${disqualRules}\nGrupo grande NAO e desqualificacao. Orcamento baixo NAO e desqualificacao.` : ""}

${scenarioText ? `CENARIOS ESPECIAIS:\n${scenarioText}` : ""}

TOOLS DISPONIVEIS:
- search_knowledge_base: Use ANTES de responder sobre servicos, taxas ou processo
- check_calendar: Use quando cliente perguntar sobre horarios disponiveis
- create_task: Use quando cliente CONFIRMAR horario de reuniao
- assign_tag: Use para classificar o lead (ex: destino mencionado)
- request_handoff: Use SOMENTE quando cliente insiste em humano ou reclamacao seria
- update_contact: Use quando cliente fornecer dados pessoais (${contactUpdateFields})
- think: Use para planejar sua resposta antes de enviar (invisivel ao cliente)
${protectedFieldsBlock}

HANDOFF: Finalize: "Vou verificar aqui e te retorno em breve!" NUNCA mencione transferencia.

${presentationBlock ? presentationBlock : `PRIMEIRO CONTATO: Se is_primeiro_contato=true, NAO se apresente novamente. Avance direto.`}

FORMATO: 1-3 frases por msg WhatsApp. Tom: ${business?.tone || "professional"}. pt-BR natural.
NUNCA mencione IA, sistema, formulario, tools, regras internas.

${handoffBlock}
${decisionsBlock}
${customAgentInstructions}
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

  // Use tool calling for template-based agents.
  // pipeline_models.main permite override de modelo/temp/max_tokens só pra etapa
  // do persona — útil quando admin quer modelo mais inteligente só pra resposta
  // ao cliente sem afetar context/data agents (que rodam em modelos baratos).
  const personaModel = agent.pipeline_models?.main?.model || agent.modelo;
  const personaTemp = agent.pipeline_models?.main?.temperature ?? agent.temperature;
  const personaMaxTok = agent.pipeline_models?.main?.max_tokens ?? agent.max_tokens;
  const tools = await loadAgentTools(supabase, agent.id);
  return callLLMWithTools(
    supabase,
    personaModel, personaTemp, personaMaxTok,
    personaPrompt, userMessage, history,
    tools,
    ctx, agent, business,
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
      const label = s.trigger_description?.trim() || s.scenario_name;
      const checks: string[] = [];
      if (s.skip_fee_presentation) checks.push(`Se aplicar cenário "${s.scenario_name}" (${label}): NÃO pode ter menção a taxa/valor/fee`);
      if (s.skip_meeting_scheduling) checks.push(`Se aplicar cenário "${s.scenario_name}" (${label}): NÃO pode agendar reunião`);
      if (s.response_adjustment) checks.push(`Se aplicar cenário "${s.scenario_name}" (${label}): ${s.response_adjustment}`);
      if (s.auto_assign_tag) checks.push(`Se aplicar cenário "${s.scenario_name}" (${label}): Deve ter chamado assign_tag("${s.auto_assign_tag}")`);
      return checks.join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const customValidator = agent.prompts_extra?.validator;
  const enabledRules = (agent.validator_rules || []).filter(r => r.enabled);
  const rulesBlock = enabledRules.length > 0
    ? `\n## Regras habilitadas no agente\n${enabledRules.map((r, i) => `${i + 1}. ${r.condition} → ${r.action === 'block' ? 'BLOQUEAR' : r.action === 'correct' ? 'CORRIGIR' : 'IGNORAR'}`).join('\n')}\n`
    : '';

  const validatorPrompt = customValidator && customValidator.trim().length > 80
    ? customValidator
        .replace('{{mensagem_proposta}}', response)
        .replace('{{contato.nome}}', ctx.contact_name || '(sem nome)')
        .replace('{{is_primeiro_contato}}', String(ctx.is_primeiro_contato))
      + rulesBlock
      + (activeScenarioChecks ? `\n## Cenários especiais deste agente\n${activeScenarioChecks}\n` : '')
      + `\n\nSe TUDO OK: retorne o texto ORIGINAL sem alterações.\nSe precisa correção: retorne apenas o texto CORRIGIDO.\nSAÍDA: apenas o texto final. Nada mais.`
    : `Voce e um validador de qualidade de mensagens WhatsApp. A maioria das mensagens esta OK — so intervenha quando algo realmente precisa de ajuste.

Analise a resposta abaixo e verifique:

1. Menciona IA, robo, modelo, prompt, sistema, agente, chatbot, bastidores? → BLOQUEIA
2. Inventa fatos nao presentes no contexto (preços, prazos, features nao mencionadas)? → BLOQUEIA
3. Tom frio, robotico ou agressivo? → CORRIJA para tom natural
4. Repete introducao/apresentacao quando NAO e primeiro contato (is_primeiro_contato=${ctx.is_primeiro_contato})? → CORRIJA
5. Menciona "formulario", "dados do sistema", "cadastro", "ActiveCampaign"? → BLOQUEIA
6. Rejeita/desqualifica lead na primeira mensagem ou sem investigar? → BLOQUEIA (na duvida, avançar)
7. Diz explicitamente "nao trabalhamos com X isolado" sem que o cliente tenha confirmado que quer só isso? → CORRIJA
8. Justifica pergunta ("para te ajudar melhor...", "para eu entender...")? → CORRIJA removendo justificativa
9. Empilha 3+ perguntas soltas sobre temas diferentes na mesma mensagem? → CORRIJA mantendo no máximo 2 perguntas relacionadas
${activeScenarioChecks ? `10. Cenarios especiais configurados:\n${activeScenarioChecks}` : ""}
${rulesBlock}
RESPOSTA a validar:
"""
${response}
"""

Se TUDO OK: responda EXATAMENTE o texto original, sem alteracoes.
Se PRECISA CORRECAO: responda o texto CORRIGIDO, pronto para enviar.

SAIDA: APENAS o texto final (original ou corrigido). Nada mais.`;

  const validatorModel = agent.pipeline_models?.validator?.model || "gpt-4.1-mini";
  const validatorTemp = agent.pipeline_models?.validator?.temperature ?? 0.1;
  const validatorMaxTok = agent.pipeline_models?.validator?.max_tokens ?? 1024;

  try {
    const { response: validated } = await callLLM(
      validatorModel, validatorTemp, validatorMaxTok,
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

// Heurística: fallback quando LLM formatter não está configurado ou falha
// G6 fix — LLM às vezes retorna strings com `\n` literal (dois caracteres: barra
// + "n") em vez de quebra de linha real. Acontece quando o modelo serializa JSON
// manualmente ou quando um stage faz JSON.stringify duplicado. Converte de volta
// pra \n real antes de salvar/enviar.
function normalizeWhatsAppText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

// G3 sanity — detecta output "lixo" do LLM (ex: "ok=true", "null", "{}") que
// vazaria como resposta final pro cliente. Critério conservador: mensagem curta
// sem espaço E sem pontuação comum de fim de frase é quase certo ser corrupção
// de debug/metadata. Quando retorna true, o main handler descarta e usa
// fallback_message + handoff silencioso.
function looksLikeCorruptedOutput(messages: string[]): boolean {
  if (!messages || messages.length === 0) return true;
  const joined = messages.join(" ").trim();
  if (!joined) return true;
  // "ok=true", "null", "true", "{}", "[]", "undefined", "200" etc.
  if (joined.length < 30 && !/\s/.test(joined) && !/[.!?,;:]/.test(joined)) {
    return true;
  }
  // Padrões clássicos de debug que nunca deveriam sair
  const debugPatterns = [
    /^ok\s*[=:]\s*true$/i,
    /^(null|undefined|true|false|nan)$/i,
    /^\{\s*\}$/,
    /^\[\s*\]$/,
    /^\d+$/, // só números
  ];
  if (debugPatterns.some((p) => p.test(joined))) return true;
  return false;
}

function formatWhatsAppMessagesHeuristic(text: string, maxBlocks = 3): string[] {
  const cap = Math.max(1, Math.min(maxBlocks, 10));

  if (text.length < 300) return [text.trim()];

  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  if (paragraphs.length >= 2 && paragraphs.length <= cap) {
    return paragraphs.map((p) => p.trim());
  }

  if (paragraphs.length > cap) {
    const perMsg = Math.ceil(paragraphs.length / cap);
    const msgs: string[] = [];
    for (let i = 0; i < paragraphs.length; i += perMsg) {
      msgs.push(paragraphs.slice(i, i + perMsg).join("\n\n").trim());
    }
    return msgs.slice(0, cap);
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length <= cap) return sentences.map((s) => s.trim());

  const perMsg = Math.ceil(sentences.length / Math.min(cap, Math.ceil(sentences.length / 2)));
  const msgs: string[] = [];
  for (let i = 0; i < sentences.length; i += perMsg) {
    msgs.push(sentences.slice(i, i + perMsg).join(" ").trim());
  }
  return msgs.slice(0, cap);
}

// LLM formatter — paridade com "Format WhatsApp Messages" da Julia no n8n.
// Divide em blocos naturais respeitando o prompt custom (prompts_extra.formatting)
// e o model/temp de pipeline_models.formatter. Mantém markdown WhatsApp e quebra
// perguntas em bloco separado. Se prompt custom for muito curto ou LLM falhar,
// cai no heurístico.
async function formatWhatsAppMessages(
  text: string,
  maxBlocks = 3,
  agent?: AgentConfig,
): Promise<string[]> {
  const cap = Math.max(1, Math.min(maxBlocks, 10));

  if (!text || !text.trim()) return [];
  if (text.length < 150) return [text.trim()];

  const customFormatter = agent?.prompts_extra?.formatting;
  const formatterModel = agent?.pipeline_models?.formatter?.model;

  const shouldUseLLM =
    (customFormatter && customFormatter.trim().length > 80)
    || !!formatterModel;

  if (!shouldUseLLM) {
    return formatWhatsAppMessagesHeuristic(text, cap);
  }

  const defaultFormatterPrompt = `Você divide respostas prontas em até ${cap} blocos naturais pra WhatsApp, sem alterar o conteúdo.

REGRA DE OURO: NUNCA altere o texto. Só divida e aplique markdown do WhatsApp.

Regras:
1. Máximo ${cap} blocos — cada um legível, sem parágrafo longo.
2. Se tiver pergunta no final, ela vai em bloco separado.
3. Dentro de cada bloco: quebras de linha após pontuação pra separar ideias.
4. Markdown WhatsApp: *negrito* (nunca **), ~tachado~, _itálico_ raro, \`link\`.
5. Jamais deixe bloco vazio.

Saída OBRIGATÓRIA em JSON:
{ "messages": ["bloco1", "bloco2", "bloco3"] }

Retorne APENAS o JSON. Nada mais.`;

  const promptBody = customFormatter && customFormatter.trim().length > 80
    ? customFormatter
        .replace(/\{\{\s*cap\s*\}\}/g, String(cap))
    : defaultFormatterPrompt;

  const model = formatterModel || agent?.modelo || "gpt-4.1-mini";
  const temperature = agent?.pipeline_models?.formatter?.temperature ?? 0.3;
  const maxTokens = agent?.pipeline_models?.formatter?.max_tokens ?? 1024;

  try {
    const { response } = await callLLM(model, temperature, maxTokens, promptBody, text);
    const cleaned = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const msgs = parsed.messages;
    if (Array.isArray(msgs) && msgs.length > 0 && msgs.every((m) => typeof m === "string" && m.trim().length > 0)) {
      return msgs.slice(0, cap).map((m: string) => normalizeWhatsAppText(m).trim());
    }
    console.warn("[formatter] LLM returned invalid shape, using heuristic fallback");
  } catch (err) {
    console.warn("[formatter] LLM error, using heuristic fallback:", err);
  }
  return formatWhatsAppMessagesHeuristic(text, cap);
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
  typingDelayMs = 1500,
  testWhitelist?: string[] | null,
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

  if (testWhitelist && testWhitelist.length > 0) {
    const normalizedWhitelist = testWhitelist.map((p) => p.replace(/\D/g, ""));
    if (!normalizedWhitelist.includes(normalizedPhone)) {
      console.warn(
        `[sendResponse] BLOCKED by test_mode_phone_whitelist: to=${normalizedPhone} allowed=${JSON.stringify(normalizedWhitelist)}`,
      );
      await supabase.from("whatsapp_messages").insert({
        contact_id: contactId,
        card_id: cardId || null,
        body: messages.join("\n\n"),
        direction: "outbound",
        is_from_me: true,
        type: "text",
        status: "blocked_test_mode",
        sender_phone: normalizedPhone,
        sent_by_user_name: "Luna IA (blocked)",
        metadata: {
          source: "ai_agent",
          blocked_reason: "test_mode_phone_whitelist",
          allowed_phones: normalizedWhitelist,
        },
      });
      return;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    // G6 defense-in-depth: garantir quebras de linha reais em qualquer
    // msg que tenha escapado dos filtros anteriores (ex: fallback_message
    // com `\n` literal escrito pelo admin).
    const msg = normalizeWhatsAppText(messages[i]);
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
        await new Promise((r) => setTimeout(r, typingDelayMs));
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
// Inbound Pattern Matcher (gatilho automation determinístico antes da IA)
// ---------------------------------------------------------------------------
// Verifica se a mensagem inbound bate com algum cadence_event_triggers de
// event_type='inbound_message_pattern' configurado pra org do agente. Se sim,
// enfileira em cadence_entry_queue (cadence-engine cuida da execução). Se o
// trigger pediu skip_ai=true (default), o pipeline IA é abortado e a regra
// determinística responde sozinha.

interface InboundPatternMatchResult {
  matched: boolean;
  skip_ai: boolean;
  matched_trigger_name?: string;
  matched_trigger_id?: string;
}

async function checkInboundPatternMatch(
  supabase: SupabaseClient,
  agentOrgId: string,
  cardId: string,
  pipelineStageId: string | null,
  messageText: string,
): Promise<InboundPatternMatchResult> {
  if (!messageText || !cardId) return { matched: false, skip_ai: false };

  // Resolve pipeline_id do card pra filtrar applicable_pipeline_ids
  let pipelineId: string | null = null;
  if (pipelineStageId) {
    const { data: stageRow } = await supabase
      .from("pipeline_stages")
      .select("pipeline_id")
      .eq("id", pipelineStageId)
      .maybeSingle();
    pipelineId = (stageRow as { pipeline_id?: string } | null)?.pipeline_id || null;
  }

  const { data: triggers, error } = await supabase
    .from("cadence_event_triggers")
    .select("id, name, event_config, applicable_pipeline_ids, applicable_stage_ids, delay_minutes")
    .eq("event_type", "inbound_message_pattern")
    .eq("is_active", true)
    .eq("org_id", agentOrgId);

  if (error) {
    console.error("[inbound_pattern] Failed to fetch triggers:", error);
    return { matched: false, skip_ai: false };
  }
  if (!triggers || triggers.length === 0) return { matched: false, skip_ai: false };

  let matchedAny = false;
  let aggregatedSkipAi = false;
  let firstName: string | undefined;
  let firstId: string | undefined;

  for (const t of triggers as Array<{
    id: string;
    name: string | null;
    event_config: Record<string, unknown> | null;
    applicable_pipeline_ids: string[] | null;
    applicable_stage_ids: string[] | null;
    delay_minutes: number | null;
  }>) {
    const cfg = (t.event_config || {}) as Record<string, unknown>;
    const pattern = String(cfg.pattern ?? "").trim();
    if (!pattern) continue;

    const apIds = t.applicable_pipeline_ids || [];
    if (apIds.length > 0 && pipelineId && !apIds.includes(pipelineId)) continue;
    const asIds = t.applicable_stage_ids || [];
    if (asIds.length > 0 && pipelineStageId && !asIds.includes(pipelineStageId)) continue;

    const mode = String(cfg.match_mode ?? "contains") as
      | "regex"
      | "contains"
      | "starts_with"
      | "equals";
    const caseSensitive = cfg.case_sensitive === true;

    let isMatch = false;
    if (mode === "regex") {
      try {
        const re = new RegExp(pattern, caseSensitive ? "" : "i");
        isMatch = re.test(messageText);
      } catch (err) {
        console.error(`[inbound_pattern] invalid regex on trigger ${t.id}:`, err);
        continue;
      }
    } else {
      const haystack = caseSensitive ? messageText : messageText.toLowerCase();
      const needle = caseSensitive ? pattern : pattern.toLowerCase();
      if (mode === "starts_with") isMatch = haystack.trimStart().startsWith(needle);
      else if (mode === "equals") isMatch = haystack.trim() === needle.trim();
      else isMatch = haystack.includes(needle); // contains (default)
    }

    if (!isMatch) continue;

    const skipAi = cfg.skip_ai !== false; // default true
    const delayMin = Number(t.delay_minutes ?? 0);
    const executeAt =
      delayMin > 0
        ? new Date(Date.now() + delayMin * 60_000).toISOString()
        : new Date().toISOString();

    const { count: pendingCount } = await supabase
      .from("cadence_entry_queue")
      .select("id", { count: "exact", head: true })
      .eq("card_id", cardId)
      .eq("trigger_id", t.id)
      .eq("status", "pending");

    if ((pendingCount ?? 0) > 0) {
      console.log(`[inbound_pattern] trigger ${t.id} já pendente pra card ${cardId}, pulando insert`);
    } else {
      const matchedSnippet =
        messageText.length > 500 ? messageText.slice(0, 500) + "…" : messageText;
      const { error: insertErr } = await supabase.from("cadence_entry_queue").insert({
        card_id: cardId,
        trigger_id: t.id,
        event_type: "inbound_message_pattern",
        event_data: {
          pattern,
          match_mode: mode,
          case_sensitive: caseSensitive,
          matched_text: matchedSnippet,
          pipeline_id: pipelineId,
          stage_id: pipelineStageId,
        },
        execute_at: executeAt,
      });
      if (insertErr) {
        console.error(`[inbound_pattern] failed to enqueue trigger ${t.id}:`, insertErr);
        continue;
      }
      console.log(
        `[inbound_pattern] enqueued ${t.id} (${t.name || "sem nome"}) card=${cardId} skip_ai=${skipAi}`,
      );
    }

    if (!matchedAny) {
      matchedAny = true;
      firstName = t.name || undefined;
      firstId = t.id;
    }
    if (skipAi) aggregatedSkipAi = true;
  }

  return {
    matched: matchedAny,
    skip_ai: aggregatedSkipAi,
    matched_trigger_name: firstName,
    matched_trigger_id: firstId,
  };
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

    // Drain mode: chamada interna após debounce window. Só permite contact_phone
    // — message_text é opcional porque o texto real mora no buffer.
    if (!input.contact_phone || (!input.message_text && !input._drain)) {
      return new Response(
        JSON.stringify({ error: "contact_phone and message_text required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Se for drain call, verificar se ainda há buffer pendente ANTES de continuar.
    // Se outro call já drenou (ex: msg nova chegou durante o wait), retorna cedo.
    if (input._drain) {
      const normalized = normalizePhone(input.contact_phone);
      const { data: pending } = await supabase
        .from("ai_message_buffer")
        .select("id")
        .eq("contact_phone", normalized)
        .is("processed_at", null)
        .limit(1);
      if (!pending || pending.length === 0) {
        return new Response(
          JSON.stringify({ handled: false, reason: "drain_no_pending" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Placeholder temporário — agente é encontrado com isso antes de processar mídia,
    // para que multimodal_config do agente possa ser respeitado no processamento.
    let processedText = messageTypeToPlaceholder(input.message_type, input.message_text);

    // ── 1a. Tentar achar agente por conversa ativa (bypass keyword — G1) ──
    // Evita que follow-ups sem palavra-chave ("Paris", "sim", "amanhã") caiam em
    // no_agent_configured depois que o cliente já começou a falar com um agente.
    let agent = await findAgentByActiveConversation(
      supabase,
      input.contact_phone,
      input.phone_number_id,
    );

    // ── 1b. Fallback: routing por keywords/filtros (primeira mensagem ou conversa expirada) ──
    if (!agent) {
      agent = await findAgentForLine(
        supabase,
        input.phone_number_label,
        input.phone_number_id,
        processedText,
        input.contact_phone,
        input.message_type, // G2: permite mídia passar sem keyword
      );
    }

    // Processar mídia (áudio/imagem/documento) se aplicável — respeitando multimodal_config do agente
    if (input.media_url && input.message_type && input.message_type !== "text") {
      processedText = await processMediaInline(
        input.message_type,
        input.media_url,
        input.message_text,
        agent?.multimodal_config,
      );
      console.log(`[main] Media processed: ${input.message_type} → ${processedText.substring(0, 100)}...`);
    }

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
    // Passa o agente para fallback conservador quando tabelas business/qualification estão vazias
    const agentConfig = await loadAgentConfig(supabase, agent.id, agent);

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

    // ── 5. Debounce check (janela configurável via agent.timings.debounce_seconds) ──
    const debounceSeconds = agent.timings?.debounce_seconds ?? 20;
    const debounceMs = debounceSeconds * 1000;
    const normalizedForBuffer = normalizePhone(input.contact_phone);
    const { data: buffered } = await supabase
      .from("ai_message_buffer")
      .select("id, message_text, message_type, media_url, created_at")
      .eq("contact_phone", normalizedForBuffer)
      .is("processed_at", null)
      .order("created_at", { ascending: true });

    if (buffered && buffered.length > 0) {
      // Debounce baseado na OLDEST: quando a mensagem mais antiga do buffer passou
      // do window, processa tudo junto (incluindo a recém-chegada). Antes usava
      // newest, mas cada mensagem nova resetava o timer e o buffer nunca drenava.
      const oldest = buffered[0];
      const ageOldestMs = Date.now() - new Date(oldest.created_at).getTime();

      if (ageOldestMs < debounceMs) {
        // Ainda dentro da janela de debounce — esperar próxima ou novo drain
        console.log(`[debounce] ${buffered.length} msgs buffered, oldest ${Math.round(ageOldestMs / 1000)}s ago — waiting (window=${debounceSeconds}s)`);

        // Fix 2026-04-23: agendar drain automático quando o window expira.
        // Se vier outra msg no meio do window, ela chama o router de novo e já
        // drena — o self-call agendado verá buffer vazio (ou com items novos) e
        // processa normalmente. Idempotente porque a query de buffer filtra por
        // processed_at IS NULL, então double-drain não responde duas vezes.
        const waitMs = debounceMs - ageOldestMs + 500;
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
          // deno-lint-ignore no-explicit-any
          const runtime = (globalThis as any).EdgeRuntime;
          const schedule = async () => {
            await new Promise((r) => setTimeout(r, waitMs));
            try {
              await fetch(`${supabaseUrl}/functions/v1/ai-agent-router`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  phone_number_id: input.phone_number_id,
                  contact_phone: input.contact_phone,
                  contact_name: input.contact_name,
                  message_text: "",
                  _drain: true,
                }),
              });
            } catch (err) {
              console.error("[debounce drain] error:", err);
            }
          };
          if (runtime?.waitUntil) {
            runtime.waitUntil(schedule());
          } else {
            // Fallback: promessa solta (edge runtime mantém viva se for retornada)
            schedule();
          }
        } catch (err) {
          console.warn("[debounce drain] schedule failed:", err);
        }

        return new Response(
          JSON.stringify({ handled: true, debounced: true, buffered_count: buffered.length, drain_scheduled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Debounce window passed — SEMPRE reconstruir processedText a partir do
      // buffer. Antes o código só fazia combine quando length>1, assumindo que
      // em length=1 o input.message_text já tinha o conteúdo. Mas com self-drain
      // (input.message_text="") isso perdia a msg. Fix 2026-04-23: sempre usa
      // o buffer como fonte-de-verdade do que o lead falou.
      const combined = buffered.map((b) => b.message_text).filter(Boolean).join("\n");
      if (combined) {
        processedText = combined;
        console.log(`[debounce] Combined ${buffered.length} message(s) from buffer (${combined.length} chars)`);
      }
      // Process media from the last media message in buffer (respeita multimodal_config)
      const lastMedia = [...buffered].reverse().find((b) => b.message_type !== "text" && b.media_url);
      if (lastMedia) {
        const mediaContent = await processMediaInline(
          lastMedia.message_type,
          lastMedia.media_url,
          lastMedia.message_text,
          agent.multimodal_config,
        );
        processedText = processedText + "\n" + mediaContent;
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
      supabase, conversationId, contactId, agentConfig, agent.memory_config,
    );

    // ── 6a. Pause guard: humano assumiu ou pause_permanently ligado ──
    // O user-turn já foi salvo acima pra preservar histórico. Aqui paramos
    // o pipeline pra não gastar tokens nem gerar resposta enquanto humano
    // está cuidando (ou handoff_actions.pause_permanently=true).
    if (ctx.card_paused) {
      console.log(
        `[main] skip pipeline — card ${ctx.card_id} paused (reason=${ctx.card_paused_reason})`,
      );
      return new Response(
        JSON.stringify({
          handled: true,
          agent: agent.nome,
          paused: true,
          reason: ctx.card_paused_reason,
          conversation_id: conversationId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 6b. Inbound pattern matcher (regra determinística antes da IA) ──
    if (ctx.card_id) {
      const patternResult = await checkInboundPatternMatch(
        supabase, agent.org_id, ctx.card_id, ctx.pipeline_stage_id, processedText,
      );
      if (patternResult.matched && patternResult.skip_ai) {
        console.log(
          `[main] inbound_message_pattern matched (${patternResult.matched_trigger_name}) — pulando pipeline IA`,
        );
        return new Response(
          JSON.stringify({
            handled: true,
            agent: agent.nome,
            inbound_pattern_matched: true,
            matched_trigger: patternResult.matched_trigger_name,
            skipped_ai: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── 7. Check escalation ──
    const { escalated, message: escalationMsg } = await checkEscalation(
      supabase, conversationId, agent, ctx.turn_count, agentConfig.business,
    );
    const maxBlocks = agent.timings?.max_message_blocks ?? 3;
    const typingDelayMs = Math.round((agent.timings?.typing_delay_seconds ?? 1.5) * 1000);

    if (escalated) {
      const msgs = await formatWhatsAppMessages(escalationMsg, maxBlocks, agent);
      await sendResponse(supabase, contactId, input.contact_phone, ctx.card_id, msgs, input.phone_number_id, typingDelayMs, agent.test_mode_phone_whitelist);
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
    let messages: string[] = [];
    let pipelineFellBack = false;
    let pipelineErrorDetails: string | null = null;

    try {
      // ── Step 1: Backoffice Agent ──
      const backoffice = await runBackofficeAgent(supabase, agent, ctx, agentConfig.business);

      // ── Step 2: Data Agent (retorna qualification_signals para o Persona) ──
      const dataResult = await runDataAgent(
        supabase, agent, ctx, backoffice,
        agentConfig.business, agentConfig.qualification,
      );

      // ── Step 3: Persona Agent (com tool calling + signals Frente E) ──
      // Cenários especiais são avaliados semanticamente pelo próprio persona a partir
      // da trigger_description no prompt; ações (assign_tag) disparam via tool calling.
      const personaResult = await runPersonaAgent(
        supabase, agent, ctx, backoffice,
        agentConfig.business, agentConfig.qualification, agentConfig.scenarios,
        processedText, dataResult.qualificationSignals,
        agentConfig.presentations,
      );
      const rawResponse = personaResult.response;
      totalInputTokens += personaResult.inputTokens;
      totalOutputTokens += personaResult.outputTokens;

      // ── Step 4: Validator ──
      const validatedResponse = await runValidator(agent, rawResponse, ctx, agentConfig.scenarios);

      // ── Step 5: Formatter ──
      messages = await formatWhatsAppMessages(validatedResponse, maxBlocks, agent);

      // G3 sanity check — se o formatter (ou qualquer LLM upstream) retornou output
      // corrompido (tipo "ok=true", "null", "{}"), descartar e cair em fallback_message.
      // Loga o raw pra facilitar root cause depois.
      if (looksLikeCorruptedOutput(messages)) {
        console.warn(
          `[main] corrupted formatter output detected, using fallback. raw_formatter_output="${(messages || []).join("|").substring(0, 300)}", raw_persona_response="${(rawResponse || "").substring(0, 300)}", raw_validator_response="${(validatedResponse || "").substring(0, 300)}"`,
        );
        throw new Error("corrupted_formatter_output");
      }

      // Override: se handoff_actions.transition_message está configurada e o agente
      // chamou request_handoff neste turno, substituímos a resposta do LLM pela
      // mensagem de transição customizada. Evita que o agente invente algo logo
      // antes de passar pro humano.
      if (ctx.handoff_triggered && agent.handoff_actions?.transition_message?.trim()) {
        messages = [agent.handoff_actions.transition_message.trim()];
        console.log(`[main] handoff transition_message override applied for agent ${agent.nome}`);
      }
    } catch (pipelineErr) {
      pipelineErrorDetails = String(pipelineErr);
      console.error(`[pipeline] fatal error in agent ${agent.nome}:`, pipelineErr);

      // ── Fallback de emergência ──
      // Envia a fallback_message do próprio agente (ou genérica) e dispara
      // handoff silencioso. Não há "agente de backup" — cada agente vive na
      // sua org/produto e não faz sentido roteamento cross-agent.
      const fbMsg = agent.fallback_message?.trim()
        || "Desculpe, tive um problema aqui agora. Um humano vai te responder em instantes.";
      messages = [fbMsg];
      pipelineFellBack = true;
      console.log(`[fallback] using fallback_message (length=${fbMsg.length})`);

      if (ctx.card_id) {
        await supabase.rpc("agent_request_handoff", {
          p_card_id: ctx.card_id,
          p_reason: "agente_sem_resposta",
          p_context_summary: `Fallback disparado após erro no pipeline: ${pipelineErrorDetails?.substring(0, 200) || ""}`,
        }).then(({ error }) => {
          if (error) console.warn(`[fallback] handoff RPC failed:`, error.message);
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════

    // Salvar resposta como turn (G5: popular skills_used + is_fallback)
    // Marco 2b: popular 5 colunas v2 quando agent.playbook_enabled e persona_v2 rodou.
    const fullResponse = messages.join("\n\n");
    const turnInsert: Record<string, unknown> = {
      conversation_id: conversationId,
      role: "assistant",
      content: fullResponse,
      agent_id: agent.id,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      skills_used: ctx.skills_used_this_turn || [],
      is_fallback: pipelineFellBack,
      agent_version: agent.playbook_enabled && ctx.v2_current_moment_key ? 'v2' : 'v1',
    };
    if (ctx.v2_current_moment_key) {
      turnInsert.current_moment_key = ctx.v2_current_moment_key;
      turnInsert.qualification_score_at_turn = ctx.v2_qualification_score_at_turn ?? null;
      turnInsert.moment_detection_method = ctx.v2_moment_detection_method ?? null;
      turnInsert.moment_transition_reason = ctx.v2_moment_transition_reason ?? null;
    }
    await supabase.from("ai_conversation_turns").insert(turnInsert);

    // Persiste last_moment_key em ai_conversation_state pro próximo turno.
    // Só faz sentido quando persona_v2 rodou com sucesso.
    if (ctx.v2_current_moment_key && !pipelineFellBack) {
      await upsertLastMomentKey(supabase, conversationId, ctx.v2_current_moment_key);
    }

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
    await sendResponse(supabase, contactId, input.contact_phone, ctx.card_id, messages, input.phone_number_id, typingDelayMs, agent.test_mode_phone_whitelist);

    return new Response(
      JSON.stringify({
        handled: true,
        agent: agent.nome,
        conversation_id: conversationId,
        pipeline: agent.is_template_based ? "v2_5step" : "v1_single",
        messages_sent: messages.length,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
        fell_back: pipelineFellBack,
        error_details: pipelineFellBack ? pipelineErrorDetails : undefined,
        handoff_triggered: ctx.handoff_triggered || false,
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
