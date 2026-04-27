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
  /**
   * Dados estruturados já coletados na conversa (vindos de cards.produto_data
   * via slots da Sondagem). Tratados como FATOS confirmados pelo evaluator —
   * evita falso negativo quando dado existe no card mas saiu do histórico curto.
   */
  form_data?: Record<string, string>;
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

  // Detecta grupos de regras mutuamente exclusivas por padrão de nome na dimension.
  // Convenção: dimension termina em _<número>_<número> → é uma faixa; grupo = prefixo sem as faixas.
  // Ex: "valor_convidado_1500_2000" → grupo "valor_convidado"
  const getGroup = (dim: string): string | null => {
    const tokens = dim.split('_');
    if (tokens.length >= 3
        && /^\d+$/.test(tokens[tokens.length - 1])
        && /^\d+$/.test(tokens[tokens.length - 2])) {
      return tokens.slice(0, -2).join('_');
    }
    return null;
  };

  const questionsBlock = subjectiveRules.map((r, i) => {
    const q = (r.condition_value as { question?: string })?.question ?? '';
    const group = getGroup(r.dimension);
    const groupTag = group ? ` [grupo: ${group}]` : '';
    return `${i + 1}. rule_id=${r.id}${groupTag} | ${q.trim()}`;
  }).join('\n');

  const hasGroups = subjectiveRules.some(r => getGroup(r.dimension) !== null);
  const groupInstruction = hasGroups
    ? `\n\nIMPORTANTE sobre grupos: Perguntas marcadas com o mesmo [grupo: X] descrevem faixas mutuamente exclusivas da mesma variável. Para cada grupo, responda YES para APENAS UMA pergunta — a que melhor descreve o caso analisando o histórico. Todas as outras perguntas do mesmo grupo devem ser NO. Se não há evidência suficiente pra escolher nenhuma faixa do grupo, responda NO em todas do grupo.`
    : '';

  const formDataEntries = Object.entries(input.form_data ?? {})
    .filter(([, v]) => v && String(v).trim());
  const formDataBlock = formDataEntries.length > 0
    ? `Dados estruturados já coletados pelo Data Agent (FATOS confirmados — use como evidência forte, mesmo que o tópico já tenha saído do histórico curto):
${formDataEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

`
    : '';

  const systemPrompt = `Você é um avaliador objetivo. Analise a conversa abaixo e responda cada pergunta com "yes" ou "no".
Baseie-se em evidências do histórico E nos dados estruturados já coletados. Se não há evidência clara em nenhum dos dois, responda "no" (conservador).

Use informação que o casal já compartilhou na conversa OU está nos dados estruturados. Se uma pergunta depende de um dado que ainda não foi mencionado nem coletado (por exemplo a estimativa real de pessoas que o casal acredita que vão de fato, quando ele só falou em quantos convites pretende enviar), responda "no" e registre na reason que o dado ainda não está disponível. Não aplique heurísticas próprias nem invente números a partir de dados parciais.${groupInstruction}

${formDataBlock}Histórico da conversa:
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
        // Sem max_completion_tokens — deixa o modelo usar o default. Cap fixo
        // truncava JSON e causava parse error silencioso (bug 2026-04-27).
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Avalie agora." },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[subjective_evaluator] LLM error status=${res.status}: ${errBody.substring(0, 300)}`);
      return { resolved: {}, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
    }

    const data = await res.json();
    const usage = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const finishReason = data.choices?.[0]?.finish_reason;
    let parsed: { evaluations?: Array<{ rule_id: string; answer: string }> };
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      // Resposta veio truncada ou malformada. Loga finish_reason pra diagnóstico
      // (ex: "length" indica que max_completion_tokens estourou).
      console.warn(`[subjective_evaluator] JSON parse failed (finish=${finishReason}, content_len=${content.length}, usage=${JSON.stringify(usage)}): ${String(parseErr).substring(0, 200)}`);
      return { resolved: {}, elapsed_ms: Date.now() - start, tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } };
    }
    const evaluations = parsed.evaluations ?? [];

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
    console.warn(`[subjective_evaluator] caught (${(err as Error).name}): ${String(err).substring(0, 300)}`);
    return { resolved: {}, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
  }
}
