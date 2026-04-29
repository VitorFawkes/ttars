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
  red_lines: string[];
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
}

export interface VoiceConfig {
  tone_tags?: string[];
  formality?: number;
  emoji_policy?: 'never' | 'after_rapport' | 'anytime';
  regionalisms?: {
    uses_a_gente?: boolean;
    uses_voces_casal?: boolean;
    uses_gerundio?: boolean;
    casual_tu_mano?: boolean;
  };
  typical_phrases?: string[];
  forbidden_phrases?: string[];
}

export interface BoundariesConfig {
  library_active?: string[];
  custom?: string[];
  custom_by_category?: Record<string, string[]>;
}

export interface ScoringRule {
  id: string;
  dimension: string;
  condition_type: 'equals' | 'range' | 'boolean_true';
  condition_value: Record<string, unknown>;
  weight: number;
  label: string | null;
  rule_type: 'qualify' | 'disqualify' | 'bonus';
  ordem: number;
}

// ---------------------------------------------------------------------------
// Loaders (paralelizáveis via Promise.all)
// ---------------------------------------------------------------------------

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
    .select("id, dimension, condition_type, condition_value, weight, label, rule_type, ordem")
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
