/**
 * moment_detector.ts — Detecção híbrida do momento atual da conversa.
 *
 * Parte do Marco 2b do Playbook Conversacional v2.
 *
 * Estratégia em cascata:
 *   1. Primeiro contato → momento com trigger_type='primeiro_contato' (ou display_order=1)
 *   2. Triggers determinísticos (keyword, score_threshold, lead_respondeu) — ordem display_order
 *   3. Sugestão do Backoffice Agent (LLM classificou via JSON estendido)
 *   4. last_moment_key (estado anterior em ai_conversation_state)
 *   5. Fallback: primeiro momento 'always' disponível ou primeiro da lista
 */

import type { PlaybookMoment } from "./playbook_loader.ts";

export interface MomentDetectionContext {
  is_primeiro_contato: boolean;
  lead_replied_now: boolean;
  last_lead_message: string | null;
  last_moment_key: string | null;
  turn_count: number;
  qualification_score_current: number | null;
}

export interface MomentDetectionResult {
  moment: PlaybookMoment;
  method: 'deterministic' | 'llm' | 'fallback' | 'manual';
  reason: string;
}

// ---------------------------------------------------------------------------

export function detectMoment({
  moments,
  ctx,
  backofficeSuggestion,
}: {
  moments: PlaybookMoment[];
  ctx: MomentDetectionContext;
  backofficeSuggestion?: string | null;
}): MomentDetectionResult {
  if (moments.length === 0) {
    throw new Error("moment_detector: sem momentos configurados");
  }

  // 1. Primeiro contato sempre pega o momento com trigger primeiro_contato OU display_order=1.
  if (ctx.is_primeiro_contato) {
    const byTrigger = moments.find(m => m.trigger_type === 'primeiro_contato');
    if (byTrigger) return { moment: byTrigger, method: 'deterministic', reason: 'primeiro_contato' };
    const first = moments.find(m => m.display_order === 1) ?? moments[0];
    return { moment: first, method: 'deterministic', reason: 'primeiro_contato_fallback_order1' };
  }

  // 2. Triggers determinísticos priorizados (keyword > score_threshold > lead_respondeu).
  //    display_order desempata. Exclui 'always' (é pra fallback).
  const prioritized = moments
    .filter(m => m.trigger_type !== 'always' && m.trigger_type !== 'primeiro_contato')
    .sort((a, b) => {
      const priorityOf = (t: string): number => {
        if (t === 'keyword') return 1;        // palavra-chave tem prioridade alta
        if (t === 'score_threshold') return 2;
        if (t === 'lead_respondeu') return 3;
        if (t === 'custom') return 4;
        return 5;
      };
      const diff = priorityOf(a.trigger_type) - priorityOf(b.trigger_type);
      return diff !== 0 ? diff : a.display_order - b.display_order;
    });

  for (const m of prioritized) {
    if (matchesTrigger(m, ctx)) {
      return { moment: m, method: 'deterministic', reason: `trigger:${m.trigger_type}` };
    }
  }

  // 3. Nenhum determinístico bateu — consulta o que o Backoffice classificou.
  if (backofficeSuggestion) {
    const byLLM = moments.find(m => m.moment_key === backofficeSuggestion);
    if (byLLM) return { moment: byLLM, method: 'llm', reason: 'backoffice_classified' };
  }

  // 4. Último momento do turno anterior (mantém a conversa onde estava).
  if (ctx.last_moment_key) {
    const prev = moments.find(m => m.moment_key === ctx.last_moment_key);
    if (prev) return { moment: prev, method: 'fallback', reason: 'last_moment_from_state' };
  }

  // 5. Fallback final: momento 'always' ou o primeiro.
  const fallback = moments.find(m => m.trigger_type === 'always') ?? moments[0];
  return { moment: fallback, method: 'fallback', reason: 'first_available' };
}

// ---------------------------------------------------------------------------

function matchesTrigger(moment: PlaybookMoment, ctx: MomentDetectionContext): boolean {
  const cfg = moment.trigger_config ?? {};
  switch (moment.trigger_type) {
    case 'lead_respondeu':
      return ctx.lead_replied_now === true && ctx.turn_count > 0;

    case 'keyword': {
      const keywords = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]) : [];
      if (keywords.length === 0) return false;
      const msg = (ctx.last_lead_message ?? "").toLowerCase();
      if (!msg) return false;
      return keywords.some(k => typeof k === 'string' && msg.includes(k.toLowerCase()));
    }

    case 'score_threshold': {
      const op = (cfg.operator as string) ?? 'gte';
      const val = Number(cfg.value ?? 0);
      const score = ctx.qualification_score_current ?? 0;
      if (op === 'gte') return score >= val;
      if (op === 'gt') return score > val;
      if (op === 'lte') return score <= val;
      if (op === 'lt') return score < val;
      if (op === 'eq') return score === val;
      return false;
    }

    case 'custom': {
      // Reservado pra v2.1 (engine de expressão). No v2.0 retorna false
      // pra não afetar ordem de avaliação — admin que escolhe 'custom'
      // precisa entender que é no-op nesta primeira versão.
      return false;
    }

    default:
      return false;
  }
}
