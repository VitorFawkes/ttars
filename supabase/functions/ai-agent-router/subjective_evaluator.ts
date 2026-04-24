/**
 * subjective_evaluator.ts — avalia regras de qualificação subjetivas via LLM.
 *
 * Parte do Marco 3.1 do Playbook Conversacional v2 (UX Qualificação).
 *
 * Regras com condition_type='ai_subjective' não dependem de campo do CRM.
 * A pergunta fica em condition_value.question ("O casal demonstra urgência?").
 *
 * Antes de chamar calculate_agent_qualification_score, o runtime:
 *   1. Separa regras subjective das outras
 *   2. Agrupa todas as perguntas subjective numa ÚNICA chamada LLM (barato)
 *   3. LLM retorna {rule_id → "yes"/"no"} pra cada pergunta
 *   4. Constrói um dict `subjective_results = {rule_X: true, rule_Y: false}`
 *   5. Passa como parte de p_inputs; converte condition_value pra boolean_true
 *      em memória antes de mandar pra RPC (ou a RPC aceita direto).
 *
 * Esta abordagem: 1 chamada LLM extra por turno (barata, gpt-4.1-mini),
 * determinística no cache da conversa.
 */

import type { ScoringRule } from "./playbook_loader.ts";

export interface SubjectiveEvalInput {
  rules: ScoringRule[];
  historico_compacto: string;
  ai_resumo: string;
  ai_contexto: string;
  agentName: string;
  openaiApiKey: string;
  model?: string;
}

export interface SubjectiveEvalResult {
  resolved: Record<string, boolean>;  // {rule_id: true/false}
  elapsed_ms: number;
  tokens: { input: number; output: number };
}

export async function evaluateSubjectiveRules(input: SubjectiveEvalInput): Promise<SubjectiveEvalResult> {
  const subjectiveRules = input.rules.filter(r => r.condition_type === 'ai_subjective');
  if (subjectiveRules.length === 0) {
    return { resolved: {}, elapsed_ms: 0, tokens: { input: 0, output: 0 } };
  }

  const start = Date.now();

  const questionsBlock = subjectiveRules.map((r, i) => {
    const q = (r.condition_value as { question?: string })?.question ?? '';
    return `${i + 1}. rule_id=${r.id} | ${q.trim()}`;
  }).join('\n');

  const systemPrompt = `Você é um avaliador objetivo. Analise a conversa abaixo e responda cada pergunta com "yes" ou "no".
Baseie-se APENAS em evidências do histórico. Se não há evidência clara, responda "no" (conservador).

Histórico da conversa:
${input.historico_compacto || '(conversa ainda vazia)'}

Resumo consolidado:
${input.ai_resumo || '(vazio)'}

Contexto cronológico:
${input.ai_contexto || '(vazio)'}

Perguntas a avaliar:
${questionsBlock}

Responda em JSON estrito:
{
  "evaluations": [
    {"rule_id": "<uuid>", "answer": "yes"|"no", "reason": "<1 frase curta>"},
    ...
  ]
}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model ?? "gpt-4.1-mini",
        temperature: 0.1,
        max_completion_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Avalie agora." },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[subjective_evaluator] LLM error: ${errBody.substring(0, 200)}`);
      return { resolved: {}, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
    }

    const data = await res.json();
    const usage = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const evaluations: Array<{ rule_id: string; answer: string }> = parsed.evaluations ?? [];

    const resolved: Record<string, boolean> = {};
    for (const e of evaluations) {
      if (e.rule_id) resolved[e.rule_id] = String(e.answer).toLowerCase().trim() === 'yes';
    }

    return {
      resolved,
      elapsed_ms: Date.now() - start,
      tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
    };
  } catch (err) {
    console.warn(`[subjective_evaluator] caught:`, err);
    return { resolved: {}, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
  }
}
