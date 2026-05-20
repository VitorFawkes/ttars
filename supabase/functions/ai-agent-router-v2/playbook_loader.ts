/**
 * playbook_loader.ts — Carrega configs v2 do agente (momentos, sinais, exemplos).
 *
 * Parte do Marco 2b do Playbook Conversacional v2. Consumido por persona_v2.ts
 * quando agent.playbook_enabled=true. Zero impacto em agentes v1.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MomentKind = 'flow' | 'play';

/**
 * Prioridade de coleta — define comportamento da agente:
 *   critical:     bloqueia avanço pro Desfecho até coletar
 *   preferred:    pergunta enquanto não qualificou; pula quando score+criticals OK
 *   nice_to_have: nunca bloqueia; pergunta opcional/oportunística
 */
export type SlotPriority = 'critical' | 'preferred' | 'nice_to_have';

export interface DiscoverySlot {
  key: string;
  label: string;
  icon?: string | null;
  /** @deprecated Use priority. Mantido pra backward compat. */
  required: boolean;
  /** Substitui required. Default 'preferred' (compat: required=true→critical, false→preferred). */
  priority?: SlotPriority;
  /** Perguntas escritas. Vazio = agente improvisa baseado em label/contexto. */
  questions: string[];
  /** Liga ao campo do CRM (system_fields.field_key). */
  crm_field_key?: string | null;
}

/** Resolve priority efetiva (backward compat com required). */
export function resolveSlotPriority(slot: DiscoverySlot): SlotPriority {
  if (slot.priority) return slot.priority;
  return slot.required ? 'critical' : 'preferred';
}

export interface DiscoveryConfig {
  slots: DiscoverySlot[];
}

export interface PlaybookMoment {
  id: string;
  agent_id: string;
  moment_key: string;
  moment_label: string;
  display_order: number;
  /** flow = fase do funil (sequencial). play = jogada situacional (interrupt por gatilho). */
  kind: MomentKind;
  trigger_type: 'primeiro_contato' | 'lead_respondeu' | 'keyword' | 'score_threshold' | 'always' | 'custom' | 'manual';
  trigger_config: Record<string, unknown>;
  message_mode: 'literal' | 'faithful' | 'free';
  /** Intenção da fase (POR QUÊ existe), separada do anchor_text (COMO falar). */
  intent?: string | null;
  anchor_text: string | null;
  /**
   * Blocos sequenciais de mensagem. Cada elemento é uma "rodada de envio".
   * Quando delivery_mode = 'wait_for_reply' e tem 2+ elementos, agente envia
   * parts[step], espera o lead responder, avança step. NULL = split runtime
   * do anchor_text por linhas "---". Migration 20260512j adicionou a coluna.
   */
  anchor_text_parts?: string[] | null;
  red_lines: string[];
  /** Pontos que toda resposta nesta fase deve cobrir (oposto prescritivo de red_lines). */
  must_cover?: string[];
  /**
   * Frases que devem sair palavra-por-palavra na resposta (qualquer modo).
   * Renderizada como bloco <must_include> no prompt + validada pós-geração via
   * fuzzy match. Se faltar, persona regera 1x com instrução reforçada.
   * Independente de must_cover (cobertura conceitual em modo livre).
   */
  literal_phrases?: string[];
  collects_fields: string[];
  /** Slots da Sondagem (só preenchido em fases de descoberta, kind=flow). */
  discovery_config: DiscoveryConfig | null;
  /**
   * Ritmo de envio. all_at_once (default) — agente quebra resposta em até
   * max_message_blocks. wait_for_reply — UMA mensagem só, espera lead responder.
   */
  delivery_mode?: 'all_at_once' | 'wait_for_reply';
  enabled: boolean;
}

export interface PlaybookSilentSignal {
  id: string;
  agent_id: string;
  signal_key: string;
  signal_label: string;
  detection_hint: string;
  crm_field_key: string | null;
  how_to_use: string | null;
  enabled: boolean;
  display_order: number;
}

export interface PlaybookFewShotExample {
  id: string;
  agent_id: string;
  lead_message: string;
  agent_response: string;
  context_note: string | null;
  related_moment_key: string | null;
  related_signal_key: string | null;
  display_order: number;
  enabled: boolean;
}

export interface IdentityConfig {
  role?: string;
  role_custom?: string | null;
  mission_one_liner?: string;
  company_description_override?: string | null;
  /**
   * Princípios de caráter da agente (per-agente, não global). Quando preenchido,
   * o engine renderiza um bloco `<principles>` separado entre `<identity>` e
   * `<agent_schedule>`. Hospeda "como eu penso" — meta-cognição que cobre
   * famílias de casos em vez de listas de regras específicas. Vazio = bloco
   * omitido (zero overhead de tokens).
   */
  principles_text?: string | null;
}

/**
 * Config de agenda do agente (lido de `ai_agents.scheduling_config`).
 * Usado pelo engine pra (a) gerar slots reais via check_calendar e (b) injetar
 * bloco `<agent_schedule>` em linguagem natural pro LLM ler como fonte única
 * de verdade — sem confabular janela diferente.
 */
export interface SchedulingConfig {
  max_days?: number;
  date_format?: 'short' | 'long';
  total_slots?: number;
  skip_weekends?: boolean;
  available_hours?: string[];
  available_windows?: Array<{ from: string; to: string }>;
  max_slots_per_day?: number;
  search_window_days?: number;
  slot_duration_minutes?: number;
  skip_today?: boolean;
}

export interface VoiceConfig {
  tone_tags?: string[];
  formality?: number;
  /**
   * Lista LIVRE de regras de tom — substituiu emoji_policy + regionalisms
   * em 2026-04-30. Cada string é renderizada como bullet em <voice>.
   */
  rules?: string[];
  typical_phrases?: string[];
  forbidden_phrases?: string[];
  // Campos legados — mantidos pra agentes ainda não migrados.
  emoji_policy?: 'never' | 'after_rapport' | 'anytime';
  regionalisms?: {
    uses_a_gente?: boolean;
    uses_voces_casal?: boolean;
    uses_gerundio?: boolean;
    casual_tu_mano?: boolean;
  };
  /** @deprecated Renomeado pra `rules`. */
  custom_rules?: string[];
}

/**
 * Item unificado do formato novo (by_category) — agrega biblioteca + custom.
 * UI V3 salva nesse formato. Quando `by_category` está presente, o router
 * prioriza ele sobre os campos legacy.
 */
export interface BoundaryItem {
  /** Texto/label visível na UI (ex "Nunca falar preço"). */
  text?: string;
  /** Subtítulo descritivo opcional — exibido na UI. */
  description?: string;
  /** Se a regra está ativa pra esse agente. */
  enabled?: boolean;
  /** ID original da biblioteca; ausente em itens custom. */
  library_id?: string;
  /** Override do texto que vai pro LLM. Quando preenchido, sobrescreve
   *  LIBRARY_DESCRIPTIONS[library_id]. Permite admin customizar regras
   *  pré-fabricadas sem perder o ID. */
  custom_text?: string;
}

export interface BoundariesConfig {
  /** Formato novo unificado (UI V3 — Marco 3.3). Quando presente, o router
   *  ignora os campos legacy abaixo. */
  by_category?: Record<string, BoundaryItem[]>;
  /** @deprecated Legacy: IDs da biblioteca marcados como ativos. */
  library_active?: string[];
  /** @deprecated Legacy: linhas custom sem categoria. */
  custom?: string[];
  /** @deprecated Legacy: linhas custom por categoria (strings simples). */
  custom_by_category?: Record<string, string[]>;
}

/**
 * Responsividade conversacional — como o agente reage quando o lead foge do roteiro
 * (devolve pergunta social, faz comentário espontâneo, manda múltiplas mensagens).
 * Renderizado como bloco <listening> em prompt_builder_v2.
 */
export interface ListeningConfig {
  echo_social_questions?: boolean;
  acknowledge_observations?: boolean;
  handle_message_bursts?: boolean;
  never_ignore_lead?: boolean;
  examples?: string[];
}

export interface ScoringRule {
  id: string;
  dimension: string;
  condition_type: 'equals' | 'range' | 'boolean_true' | 'ai_subjective';
  condition_value: Record<string, unknown>;
  weight: number;
  label: string | null;
  rule_type: 'qualify' | 'disqualify' | 'bonus';
  ordem: number;
  exclusion_group: string | null;
}

// ---------------------------------------------------------------------------
// Loaders (paralelizáveis via Promise.all)
// ---------------------------------------------------------------------------

/**
 * Resolve os blocos sequenciais de um momento.
 *
 * Prioridade:
 *   1. anchor_text_parts (coluna nova) — array curado pelo admin na UI
 *   2. Fallback: split do anchor_text por linhas contendo "---"/"***"/"___"
 *   3. Fallback final: anchor_text inteiro como bloco único
 *
 * Retorna [] se nada estiver configurado.
 */
export function resolveMomentParts(m: PlaybookMoment): string[] {
  if (m.anchor_text_parts && m.anchor_text_parts.length > 0) {
    return m.anchor_text_parts.map((p) => p.trim()).filter((p) => p.length > 0);
  }
  if (!m.anchor_text) return [];
  // Split por linhas com 3+ hífens/asteriscos/underscores
  const parts = m.anchor_text
    .split(/\n[ \t]*[-*_]{3,}[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [m.anchor_text.trim()];
}

export async function loadPlaybookMoments(
  supabase: SupabaseClient,
  agentId: string,
): Promise<PlaybookMoment[]> {
  const { data, error } = await supabase
    .from("ai_agent_moments")
    .select("*")
    .eq("agent_id", agentId)
    .eq("enabled", true)
    .order("display_order", { ascending: true });
  if (error) {
    console.error("[playbook_loader] loadPlaybookMoments error:", error);
    return [];
  }
  return (data || []) as PlaybookMoment[];
}

export async function loadPlaybookSilentSignals(
  supabase: SupabaseClient,
  agentId: string,
): Promise<PlaybookSilentSignal[]> {
  const { data, error } = await supabase
    .from("ai_agent_silent_signals")
    .select("*")
    .eq("agent_id", agentId)
    .eq("enabled", true)
    .order("display_order", { ascending: true });
  if (error) {
    console.error("[playbook_loader] loadPlaybookSilentSignals error:", error);
    return [];
  }
  return (data || []) as PlaybookSilentSignal[];
}

export async function loadPlaybookFewShotExamples(
  supabase: SupabaseClient,
  agentId: string,
): Promise<PlaybookFewShotExample[]> {
  const { data, error } = await supabase
    .from("ai_agent_few_shot_examples")
    .select("*")
    .eq("agent_id", agentId)
    .eq("enabled", true)
    .order("display_order", { ascending: true });
  if (error) {
    console.error("[playbook_loader] loadPlaybookFewShotExamples error:", error);
    return [];
  }
  return (data || []) as PlaybookFewShotExample[];
}

export async function loadScoringRulesForPlaybook(
  supabase: SupabaseClient,
  agentId: string,
): Promise<ScoringRule[]> {
  const { data, error } = await supabase
    .from("ai_agent_scoring_rules")
    .select("id, dimension, condition_type, condition_value, weight, label, rule_type, ordem, exclusion_group")
    .eq("agent_id", agentId)
    .eq("ativa", true)
    .order("rule_type, dimension, ordem, id");
  if (error) {
    console.error("[playbook_loader] loadScoringRulesForPlaybook error:", error);
    return [];
  }
  return (data || []) as ScoringRule[];
}

/**
 * Atualiza `last_moment_key` em `ai_conversation_state` após persona_v2 responder.
 * Usado em conjunto com o fluxo de persistir ai_conversation_turns — mantém o
 * estado entre turnos pra moment_detector poder consultar "onde estava".
 */
export async function upsertLastMomentKey(
  supabase: SupabaseClient,
  conversationId: string,
  momentKey: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("ai_conversation_state")
      .update({
        last_moment_key: momentKey,
        last_moment_updated_at: new Date().toISOString(),
      })
      .eq("conversation_id", conversationId);
    if (error) {
      console.warn("[playbook_loader] upsertLastMomentKey update error:", error);
      // Se a linha não existe (novo), faz insert
      const { error: insertErr } = await supabase
        .from("ai_conversation_state")
        .insert({
          conversation_id: conversationId,
          last_moment_key: momentKey,
          last_moment_updated_at: new Date().toISOString(),
        });
      if (insertErr) {
        console.warn("[playbook_loader] upsertLastMomentKey insert error:", insertErr);
      }
    }
  } catch (err) {
    console.warn("[playbook_loader] upsertLastMomentKey caught:", err);
  }
}

/**
 * Lê last_moment_key da ai_conversation_state pra injetar no ctx no próximo turno.
 */
export async function readLastMomentKey(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_conversation_state")
      .select("last_moment_key")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) {
      console.warn("[playbook_loader] readLastMomentKey error:", error);
      return null;
    }
    return (data?.last_moment_key as string) ?? null;
  } catch (err) {
    console.warn("[playbook_loader] readLastMomentKey caught:", err);
    return null;
  }
}
