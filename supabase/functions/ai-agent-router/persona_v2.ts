/**
 * persona_v2.ts — Orquestrador do Persona Agent v2 (Playbook Conversacional).
 *
 * Parte do Marco 2b. Chamado pelo guard no runPersonaAgent quando
 * agent.playbook_enabled=true. Se lançar exceção, o guard cai pro v1
 * automaticamente (fail-safe).
 *
 * Etapas:
 *   1. Carrega configs v2 do agente em paralelo (moments, signals, examples, scoring).
 *   2. Calcula score atual pra injetar no prompt como <qualification_status>.
 *   3. Detecta momento atual (híbrido: determinístico + LLM do backoffice).
 *   4. Monta prompt XML via buildPromptV2.
 *   5. Chama LLM (SEM tool-calling nesta v2.0 — tools ficam pra v2.1).
 *   6. Retorna resposta + metadata pra caller persistir em ai_conversation_turns.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadPlaybookMoments,
  loadPlaybookSilentSignals,
  loadPlaybookFewShotExamples,
  loadScoringRulesForPlaybook,
  type PlaybookMoment,
  type IdentityConfig,
  type VoiceConfig,
  type BoundariesConfig,
} from "./playbook_loader.ts";
import { detectMoment, type MomentDetectionContext } from "./moment_detector.ts";
import { buildPromptV2 } from "./prompt_builder_v2.ts";
import { evaluateSubjectiveRules } from "./subjective_evaluator.ts";

// ---------------------------------------------------------------------------
// Types (alinhados com index.ts — evitamos import circular definindo o mínimo)
// ---------------------------------------------------------------------------

interface AgentV2Config {
  id: string;
  org_id: string;
  nome: string;
  modelo: string;
  temperature: number;
  max_tokens: number;
  playbook_enabled: boolean;
  identity_config: IdentityConfig | null;
  voice_config: VoiceConfig | null;
  boundaries_config: BoundariesConfig | null;
  pipeline_models?: Record<string, { model?: string; temperature?: number; max_tokens?: number }> | null;
}

interface BusinessV2Config {
  company_name?: string;
  company_description?: string;
  methodology_text?: string;
}

interface CtxV2 {
  is_primeiro_contato: boolean;
  contact_name: string;
  contact_name_known: boolean;
  contact_role: string;
  card_id: string | null;
  card_titulo: string | null;
  pipeline_stage_id: string | null;
  ai_resumo: string;
  ai_contexto: string;
  form_data: Record<string, string>;
  historico_compacto: string;
  lead_replied_now: boolean;
  turn_count: number;
  last_moment_key: string | null;
  last_lead_message: string | null;
}

interface BackofficeV2Output {
  ai_resumo: string;
  ai_contexto: string;
  detected_role: string;
  current_moment_key?: string | null;
  moment_transition_reason?: string | null;
}

export interface PersonaV2Result {
  response: string;
  inputTokens: number;
  outputTokens: number;
  v2Metadata: {
    current_moment_key: string;
    qualification_score_at_turn: number | null;
    moment_detection_method: 'deterministic' | 'llm' | 'fallback' | 'manual';
    moment_transition_reason: string;
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runPersonaAgent_v2(
  supabase: SupabaseClient,
  agent: AgentV2Config,
  ctx: CtxV2,
  backoffice: BackofficeV2Output,
  business: BusinessV2Config | null,
  userMessage: string,
  qualificationSignals: Record<string, string>,
  callLLM: (
    model: string, temp: number, maxTok: number,
    systemPrompt: string, userMsg: string,
  ) => Promise<{ response: string; inputTokens: number; outputTokens: number }>,
): Promise<PersonaV2Result> {

  // 1. Carrega configs v2 em paralelo
  const [moments, silentSignals, fewShotExamples, scoringRules] = await Promise.all([
    loadPlaybookMoments(supabase, agent.id),
    loadPlaybookSilentSignals(supabase, agent.id),
    loadPlaybookFewShotExamples(supabase, agent.id),
    loadScoringRulesForPlaybook(supabase, agent.id),
  ]);

  if (moments.length === 0) {
    throw new Error(`persona_v2: agent ${agent.id} playbook_enabled=true mas nenhum momento configurado`);
  }

  // 2. Calcula score via RPC existente + avaliação ai_subjective (Marco 3.1)
  const scoreInfo = await calculateCurrentScore(
    supabase, agent.id, ctx, qualificationSignals,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoringRules as any, agent.nome,
  );

  // 3. Detecta momento atual (híbrido: determinístico + LLM)
  const detCtx: MomentDetectionContext = {
    is_primeiro_contato: ctx.is_primeiro_contato,
    lead_replied_now: ctx.lead_replied_now,
    last_lead_message: ctx.last_lead_message,
    last_moment_key: ctx.last_moment_key,
    turn_count: ctx.turn_count,
    qualification_score_current: scoreInfo.score,
  };

  const detected = detectMoment({
    moments,
    ctx: detCtx,
    backofficeSuggestion: backoffice.current_moment_key ?? null,
  });

  // Log estruturado pra observabilidade (cai em Supabase Functions Logs)
  console.log(JSON.stringify({
    event: 'moment_detected',
    agent_id: agent.id,
    conversation_card_id: ctx.card_id,
    moment_key: detected.moment.moment_key,
    method: detected.method,
    reason: detected.reason,
    last_moment_key: ctx.last_moment_key,
    score_at_turn: scoreInfo.score,
    backoffice_suggestion: backoffice.current_moment_key ?? null,
  }));

  // 4. Calcula missingFields pro <qualification_status>
  const missingFields: string[] = [];
  for (const m of moments) {
    for (const f of (m.collects_fields ?? [])) {
      if (!ctx.form_data[f] && !qualificationSignals[f] && !missingFields.includes(f)) {
        missingFields.push(f);
      }
    }
  }

  // 5. Monta o prompt
  const prompt = buildPromptV2({
    agentName: agent.nome,
    companyName: business?.company_name ?? '',
    identity: agent.identity_config,
    voice: agent.voice_config,
    boundaries: agent.boundaries_config,
    moments,
    currentMoment: detected.moment,
    currentMomentMethod: detected.method,
    silentSignals,
    fewShotExamples,
    scoringRules,
    scoreInfo: { ...scoreInfo, missingFields },
    ctx: {
      is_primeiro_contato: ctx.is_primeiro_contato,
      contact_name: ctx.contact_name,
      contact_name_known: ctx.contact_name_known,
      contact_role: ctx.contact_role,
      card_id: ctx.card_id,
      card_titulo: ctx.card_titulo,
      pipeline_stage_id: ctx.pipeline_stage_id,
      ai_resumo: backoffice.ai_resumo || ctx.ai_resumo,
      ai_contexto: backoffice.ai_contexto || ctx.ai_contexto,
      form_data: ctx.form_data,
      qualificationSignals,
      historico_compacto: ctx.historico_compacto,
      last_moment_key: ctx.last_moment_key,
    },
    userMessage,
    companyDescription: business?.methodology_text ?? business?.company_description,
  });

  // 6. Chama LLM (sem tools nesta v2.0)
  const personaModel = agent.pipeline_models?.main?.model || agent.modelo;
  const personaTemp = agent.pipeline_models?.main?.temperature ?? agent.temperature;
  const personaMaxTok = agent.pipeline_models?.main?.max_tokens ?? agent.max_tokens;

  const { response, inputTokens, outputTokens } = await callLLM(
    personaModel, personaTemp, personaMaxTok,
    prompt, userMessage,
  );

  return {
    response,
    inputTokens,
    outputTokens,
    v2Metadata: {
      current_moment_key: detected.moment.moment_key,
      qualification_score_at_turn: scoreInfo.score,
      moment_detection_method: detected.method,
      moment_transition_reason: backoffice.moment_transition_reason || detected.reason,
    },
  };
}

// ---------------------------------------------------------------------------
// Score helper
// ---------------------------------------------------------------------------

async function calculateCurrentScore(
  supabase: SupabaseClient,
  agentId: string,
  ctx: CtxV2,
  qualificationSignals: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scoringRules?: any[],
  agentName?: string,
): Promise<{
  enabled: boolean;
  score: number | null;
  threshold: number | null;
  qualificado: boolean | null;
  disqualified?: boolean;
  breakdown?: Array<Record<string, unknown>>;
}> {
  const inputs: Record<string, unknown> = { ...ctx.form_data, ...qualificationSignals };

  // Pré-processa regras ai_subjective via LLM (Marco 3.1)
  const subjectiveResults: Record<string, boolean> = {};
  if (scoringRules && scoringRules.length > 0) {
    const subj = scoringRules.filter((r) => r.condition_type === 'ai_subjective');
    if (subj.length > 0) {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          const evalRes = await evaluateSubjectiveRules({
            rules: subj,
            historico_compacto: ctx.historico_compacto,
            ai_resumo: ctx.ai_resumo,
            ai_contexto: ctx.ai_contexto,
            agentName: agentName ?? '',
            openaiApiKey: openaiKey,
          });
          Object.assign(subjectiveResults, evalRes.resolved);
          console.log(JSON.stringify({
            event: 'subjective_evaluated',
            agent_id: agentId, rules_count: subj.length,
            resolved: evalRes.resolved, tokens: evalRes.tokens,
            elapsed_ms: evalRes.elapsed_ms,
          }));
        } catch (err) {
          console.warn('[persona_v2] subjective eval failed:', err);
        }
      }
    }
  }

  try {
    const { data, error } = await supabase.rpc('calculate_agent_qualification_score', {
      p_agent_id: agentId,
      p_inputs: inputs,
    });
    if (error) {
      console.warn('[persona_v2] calculate_agent_qualification_score error:', error);
      return { enabled: false, score: null, threshold: null, qualificado: null };
    }

    // Aplica regras ai_subjective resolvidas (não são conhecidas pela RPC)
    let score = Number(data?.score ?? 0);
    let disqualified = Boolean(data?.disqualified ?? false);
    const breakdown = Array.isArray(data?.breakdown) ? [...data.breakdown] : [];

    if (scoringRules) {
      for (const r of scoringRules) {
        if (r.condition_type !== 'ai_subjective') continue;
        if (subjectiveResults[r.id] !== true) continue;
        if (r.rule_type === 'disqualify') {
          disqualified = true;
        } else {
          score += Number(r.weight ?? 0);
          breakdown.push({
            dimension: r.dimension,
            label: r.label ?? r.dimension,
            weight: r.weight ?? 0,
            rule_id: r.id,
            rule_type: r.rule_type ?? 'qualify',
            source: 'ai_subjective',
          });
        }
      }
    }

    const threshold = Number(data?.threshold ?? 0);
    return {
      enabled: Boolean(data?.enabled),
      score,
      threshold,
      qualificado: disqualified ? false : score >= threshold,
      disqualified,
      breakdown,
    };
  } catch (err) {
    console.warn('[persona_v2] score calculation failed:', err);
    return { enabled: false, score: null, threshold: null, qualificado: null };
  }
}
