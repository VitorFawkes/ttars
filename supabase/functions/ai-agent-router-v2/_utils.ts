// Utilities da Patricia (single-agent v2).
//
// MVP scope: só processamento de mensagens TEXT. Multimodal (audio/imagem/documento)
// e outbound triggers ficam pra fase futura, se Patricia vencer cutover.
//
// Este módulo é INDEPENDENTE do `ai-agent-router/` v1 — não importa nada de lá.
// Funções aqui são essenciais pra o handler do `index.ts`.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types compartilhados (subset do v1)
// ============================================================================

export interface AgentRow {
  id: string;
  org_id: string;
  produto: string | null;
  nome: string;
  ativa: boolean;
  modelo: string | null;
  temperature: number | null;
  max_tokens: number | null;
  test_mode_phone_whitelist: string[] | null;
  validator_rules: Array<{
    id: string;
    condition: string;
    action: "block" | "correct" | "ignore";
    enabled: boolean;
  }> | null;
  pipeline_models: Record<string, unknown> | null;
  identity_config: Record<string, unknown> | null;
  voice_config: Record<string, unknown> | null;
  boundaries_config: Record<string, unknown> | null;
  listening_config: Record<string, unknown> | null;
  handoff_actions: Record<string, unknown> | null;
  handoff_signals: unknown;
  intelligent_decisions: Record<string, unknown> | null;
  context_fields_config: Record<string, unknown> | null;
  engine: string;
  timings: { debounce_seconds?: number; typing_delay_seconds?: number; max_message_blocks?: number } | null;
}

export interface BusinessConfigRow {
  agent_id: string;
  company_name: string | null;
  company_description: string | null;
  methodology_text: string | null;
  process_steps: unknown[] | null;
  protected_fields: string[] | null;
  auto_update_fields: string[] | null;
  contact_update_fields: string[] | null;
  secondary_contact_role_name: string | null;
  custom_blocks: unknown;
}

export interface IncomingMessageInput {
  contact_phone: string;
  message_text: string;
  message_type?: string;
  phone_number_id: string;
  phone_number_label?: string;
  echo_conversation_id?: string;
}

// ============================================================================
// Phone helpers
// ============================================================================

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function isPhoneInWhitelist(
  phone: string,
  whitelist: string[] | null,
): boolean {
  if (!whitelist || whitelist.length === 0) return true; // sem whitelist = todos permitidos
  const normalized = normalizePhone(phone);
  return whitelist.some((w) => normalizePhone(w) === normalized);
}

// ============================================================================
// OpenAI helper (chamada simples, sem tools loop)
// ============================================================================

export interface CallLLMResult {
  response: string;
  duration_ms: number;
  model_used: string;
}

export async function callLLM(
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  responseFormat?: Record<string, unknown>,
): Promise<CallLLMResult> {
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model,
    temperature,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI HTTP ${response.status}: ${err.substring(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  return {
    response: content,
    duration_ms: Date.now() - startedAt,
    model_used: model,
  };
}

// ============================================================================
// Echo (WhatsApp) sender
// ============================================================================

export interface SendEchoResult {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

export async function sendEchoMessage(
  echoApiUrl: string,
  echoApiKey: string,
  phoneNumberId: string,
  contactPhone: string,
  text: string,
): Promise<SendEchoResult> {
  try {
    const normalizedPhone = contactPhone.replace(/\D/g, "");
    const response = await fetch(echoApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": echoApiKey,
      },
      body: JSON.stringify({
        to: normalizedPhone,
        message: text,
        phone_number_id: phoneNumberId,
      }),
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: responseText.substring(0, 500),
    };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// ============================================================================
// Format pra WhatsApp (heurístico, sem LLM)
// ============================================================================

export function normalizeWhatsAppText(text: string): string {
  if (!text) return "";
  return text
    // remove separadores markdown (---, ***, ___) em linha isolada — o LLM
    // usa como divisor visual entre blocos, mas no WhatsApp vira texto literal.
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    // remove travessões e hífens longos como separadores
    .replace(/\s*[—–]\s*/g, ". ")
    // colapsa espaços múltiplos
    .replace(/[ \t]{2,}/g, " ")
    // limita newlines a 2 seguidos
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatWhatsAppMessagesHeuristic(
  text: string,
  maxBlocks = 3,
  maxCharsPerBlock = 1024,
): string[] {
  const normalized = normalizeWhatsAppText(text);
  if (!normalized) return [];

  // Tenta quebrar em blocos por \n\n primeiro
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);

  if (paragraphs.length <= maxBlocks) {
    // Cada parágrafo é uma mensagem (truncar se passar de maxCharsPerBlock)
    return paragraphs.map((p) => p.length > maxCharsPerBlock ? p.substring(0, maxCharsPerBlock - 1) + "…" : p);
  }

  // Junta em maxBlocks blocos
  const result: string[] = [];
  const perBlock = Math.ceil(paragraphs.length / maxBlocks);
  for (let i = 0; i < maxBlocks; i++) {
    const chunk = paragraphs.slice(i * perBlock, (i + 1) * perBlock).join("\n\n");
    if (chunk) result.push(chunk.length > maxCharsPerBlock ? chunk.substring(0, maxCharsPerBlock - 1) + "…" : chunk);
  }
  return result;
}

// ============================================================================
// Conversation history helpers
// ============================================================================

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 20,
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from("ai_conversation_turns")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[loadConversationHistory] error:", error);
    return [];
  }
  return (data || []).reverse() as ConversationTurn[];
}

export function compactConversationHistory(turns: ConversationTurn[]): string {
  if (turns.length === 0) return "(sem histórico)";

  const lines: string[] = [];
  for (const turn of turns) {
    const role = turn.role === "user" ? "Lead" : turn.role === "assistant" ? "Você" : "Sistema";
    lines.push(`${role}: ${turn.content}`);
  }
  return lines.join("\n");
}

// ============================================================================
// Tools execution (RPCs / Supabase calls)
// ============================================================================

export interface ToolCallInput {
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  tool_name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  duration_ms: number;
}

export async function executePatriciaToolCall(
  supabase: SupabaseClient,
  agent: AgentRow,
  cardId: string | null,
  contactId: string | null,
  call: ToolCallInput,
): Promise<ToolCallResult> {
  const startedAt = Date.now();
  try {
    switch (call.tool_name) {
      case "calculate_qualification_score": {
        const fields = (call.args.fields as Record<string, unknown>) || call.args;
        const { data, error } = await supabase.rpc(
          "calculate_agent_qualification_score",
          { p_agent_id: agent.id, p_inputs: fields },
        );
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: data, duration_ms: Date.now() - startedAt };
      }

      case "search_knowledge_base": {
        // Patricia v1: KB ainda não populada (ver memory). Fallback que loga.
        console.log("[tool] search_knowledge_base (KB ainda vazia)", call.args);
        return { tool_name: call.tool_name, ok: true, result: { results: [] }, duration_ms: Date.now() - startedAt };
      }

      case "check_calendar": {
        // Stub: retorna 3 slots mock pra próximos dias úteis (10h, 14h, 16h)
        const today = new Date();
        const slots: Array<{ date: string; time: string; weekday: string }> = [];
        const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
        for (let i = 1; slots.length < 3 && i < 10; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const wd = d.getDay();
          if (wd === 0 || wd === 6) continue; // pula fim de semana
          const dStr = d.toLocaleDateString("pt-BR");
          ["10:00", "14:00", "16:00"].forEach((t) => {
            if (slots.length < 3) slots.push({ date: dStr, time: t, weekday: weekdays[wd] });
          });
        }
        return {
          tool_name: call.tool_name,
          ok: true,
          result: { slots_disponiveis: slots },
          duration_ms: Date.now() - startedAt,
        };
      }

      case "request_handoff": {
        // Aplica handoff_actions do agente (similar a v1, simplificado)
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        const ha = agent.handoff_actions || {};
        const updates: Record<string, unknown> = { handoff_pending: true };
        if (ha.change_stage_id) updates.etapa_id = ha.change_stage_id;
        const { error } = await supabase.from("cards").update(updates).eq("id", cardId);
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: { applied: updates }, duration_ms: Date.now() - startedAt };
      }

      case "update_contact": {
        if (!contactId) {
          return { tool_name: call.tool_name, ok: false, error: "contato_id ausente", duration_ms: Date.now() - startedAt };
        }
        const allowed = ["nome", "email", "data_nascimento"];
        const patch: Record<string, unknown> = {};
        for (const k of allowed) {
          if (call.args[k] != null) patch[k] = call.args[k];
        }
        if (Object.keys(patch).length === 0) {
          return { tool_name: call.tool_name, ok: true, result: { skipped: true }, duration_ms: Date.now() - startedAt };
        }
        const { error } = await supabase.from("contatos").update(patch).eq("id", contactId);
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: { applied: patch }, duration_ms: Date.now() - startedAt };
      }

      case "assign_tag": {
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        const tagName = call.args.tag_name || call.args.name;
        if (!tagName) {
          return { tool_name: call.tool_name, ok: false, error: "tag_name ausente", duration_ms: Date.now() - startedAt };
        }
        // Implementação simplificada: insert na junction table sem checar duplicate
        const { error } = await supabase.rpc("assign_card_tag_by_name", {
          p_card_id: cardId,
          p_tag_name: tagName,
          p_color: call.args.color || null,
        });
        if (error) {
          console.warn("[tool] assign_tag falhou (RPC pode não existir):", error.message);
          return { tool_name: call.tool_name, ok: false, error: error.message, duration_ms: Date.now() - startedAt };
        }
        return { tool_name: call.tool_name, ok: true, result: { tag: tagName }, duration_ms: Date.now() - startedAt };
      }

      case "create_task": {
        if (!cardId) {
          return { tool_name: call.tool_name, ok: false, error: "card_id ausente", duration_ms: Date.now() - startedAt };
        }
        const { data, error } = await supabase
          .from("activities")
          .insert({
            card_id: cardId,
            tipo: call.args.tipo || "tarefa",
            titulo: call.args.titulo || "Tarefa",
            descricao: call.args.descricao || null,
            data_inicio: call.args.data_inicio || null,
            assignee_id: call.args.assignee_id || null,
            org_id: agent.org_id,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { tool_name: call.tool_name, ok: true, result: data, duration_ms: Date.now() - startedAt };
      }

      default:
        return {
          tool_name: call.tool_name,
          ok: false,
          error: `Tool desconhecida: ${call.tool_name}`,
          duration_ms: Date.now() - startedAt,
        };
    }
  } catch (e) {
    return {
      tool_name: call.tool_name,
      ok: false,
      error: (e as Error).message,
      duration_ms: Date.now() - startedAt,
    };
  }
}
