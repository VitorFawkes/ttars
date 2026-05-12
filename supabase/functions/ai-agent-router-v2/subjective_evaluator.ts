/**
 * subjective_evaluator.ts — avalia regras de qualificação subjetivas via LLM.
 *
 * CÓPIA ISOLADA do equivalente da Estela (ai-agent-router/subjective_evaluator.ts).
 * Engines `single_agent_v2` (Patricia) e `multi_agent_pipeline` (Estela) são
 * experimentos paralelos: não compartilham código por design. Manter este
 * arquivo como cópia própria do router v2, sem importar nada do router v1.
 *
 * Regras com condition_type='ai_subjective' não dependem de campo do CRM.
 * A pergunta fica em condition_value.question ("O casal demonstra urgência?").
 *
 * Antes (ou em paralelo) de chamar calculate_agent_qualification_score, o
 * runtime do v2:
 *   1. Separa regras subjective das outras
 *   2. Avalia determinísticamente quem tem formula conhecida (value_per_guest,
 *      budget_below, budget_above) sem chamar LLM
 *   3. Agrupa o que sobrou numa ÚNICA chamada LLM (barato)
 *   4. LLM retorna {rule_id → "yes"/"no"} pra cada pergunta
 *   5. Constrói um dict `resolved = {rule_id: true/false}`
 *
 * 1 chamada LLM extra por turn que dispara o trigger (gpt-5.1).
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

/**
 * Avaliação determinística de fórmulas conhecidas. Quando o admin escolhe
 * "valor por convidado / faixa" na UI, salvamos `condition_value.formula` +
 * `min`/`max` em vez de pergunta livre — eliminando a divergência label vs
 * pergunta que existia antes (label dizia "1.000-1.500" e a pergunta do LLM
 * dizia "3.500-4.000" porque os campos eram editáveis em separado).
 *
 * Retorna `null` quando não consegue avaliar (formula desconhecida, dados
 * faltando, etc) — nesse caso o evaluator cai no LLM se a regra também tiver
 * uma `question` textual; senão retorna NO conservador.
 */
function evaluateDeterministic(
  formula: string,
  cv: Record<string, unknown>,
  formData: Record<string, string>,
): boolean | null {
  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const cleaned = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  if (formula === 'value_per_guest') {
    const orc = toNum(formData.ww_orcamento_total ?? formData.ww_orcamento_faixa ?? formData.orcamento_total);
    const guests = toNum(formData.ww_num_convidados ?? formData.num_convidados);
    if (orc == null || guests == null || guests <= 0) return null; // sem dado → fallback
    const perGuest = orc / guests;
    const min = toNum(cv.min);
    const max = toNum(cv.max);
    if (min != null && max != null) return perGuest >= min && perGuest < max;
    if (min != null) return perGuest >= min;
    if (max != null) return perGuest < max;
    return null;
  }

  if (formula === 'budget_below') {
    const orc = toNum(formData.ww_orcamento_total ?? formData.ww_orcamento_faixa ?? formData.orcamento_total);
    const threshold = toNum(cv.value ?? cv.max);
    if (orc == null || threshold == null) return null;
    return orc < threshold; // ESTRITO — 50k não é abaixo de 50k
  }

  if (formula === 'budget_above') {
    const orc = toNum(formData.ww_orcamento_total ?? formData.ww_orcamento_faixa ?? formData.orcamento_total);
    const threshold = toNum(cv.value ?? cv.min);
    if (orc == null || threshold == null) return null;
    return orc > threshold;
  }

  return null; // formula desconhecida
}

export async function evaluateSubjectiveRules(input: SubjectiveEvalInput): Promise<SubjectiveEvalResult> {
  const subjectiveRules = input.rules.filter(r => r.condition_type === 'ai_subjective');
  if (subjectiveRules.length === 0) {
    return { resolved: {}, elapsed_ms: 0, tokens: { input: 0, output: 0 } };
  }

  const start = Date.now();

  // 1ª passada — calcular determinísticamente o que dá. O resto vai pro LLM.
  const formData = input.form_data ?? {};
  const deterministicResolved: Record<string, boolean> = {};
  const llmRules: ScoringRule[] = [];
  for (const r of subjectiveRules) {
    const cv = (r.condition_value ?? {}) as Record<string, unknown>;
    const formula = typeof cv.formula === 'string' ? cv.formula : null;
    if (formula) {
      const det = evaluateDeterministic(formula, cv, formData);
      if (det !== null) {
        deterministicResolved[r.id] = det;
        continue;
      }
      // formula presente mas dado faltou → conservador (NO) e não chama LLM
      deterministicResolved[r.id] = false;
      continue;
    }
    llmRules.push(r);
  }

  // Se não sobrou nada pro LLM, retorna direto
  if (llmRules.length === 0) {
    return {
      resolved: deterministicResolved,
      elapsed_ms: Date.now() - start,
      tokens: { input: 0, output: 0 },
    };
  }

  // Detecta grupos de regras mutuamente exclusivas. Duas fontes:
  //   1. Coluna explícita exclusion_group (preferencial — admin define).
  //   2. Convenção legada: dimension termina em _<número>_<número> → grupo
  //      = prefixo sem as faixas (ex: "valor_convidado_1500_2000" → grupo
  //      "valor_convidado"). Mantida pra retrocompat com regras criadas
  //      antes da coluna existir.
  const getGroupForRule = (r: ScoringRule): string | null => {
    if (r.exclusion_group && r.exclusion_group.trim().length > 0) {
      return r.exclusion_group;
    }
    const tokens = r.dimension.split('_');
    if (tokens.length >= 3
        && /^\d+$/.test(tokens[tokens.length - 1])
        && /^\d+$/.test(tokens[tokens.length - 2])) {
      return tokens.slice(0, -2).join('_');
    }
    return null;
  };

  const questionsBlock = llmRules.map((r, i) => {
    const q = (r.condition_value as { question?: string })?.question ?? '';
    const group = getGroupForRule(r);
    const groupTag = group ? ` [grupo: ${group}]` : '';
    return `${i + 1}. rule_id=${r.id}${groupTag} | ${q.trim()}`;
  }).join('\n');

  const hasGroups = llmRules.some(r => getGroupForRule(r) !== null);
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

Use informação que o casal já compartilhou na conversa OU está nos dados estruturados. Quando os dados estruturados trazem campos como número de convidados ou orçamento, trate-os como fatos confirmados pelo casal — eles foram coletados pela agente já com a premissa correta (ex: convidados = quem deve comparecer de fato). Faça os cálculos pedidos pela pergunta usando esses números diretamente, sem reaplicar ressalvas que a pergunta não exige. Se um dado essencial para responder NÃO está disponível em nenhuma das fontes, responda "no" e registre na reason. Não aplique heurísticas próprias nem invente números a partir de dados parciais.

REGRAS DE COMPARAÇÃO ESTRITA (LEIA COM ATENÇÃO):
- "Abaixo de X", "menor que X", "inferior a X", "menos de X" significam ESTRITAMENTE MENOR (<). NÃO inclui o próprio X.
  Exemplo: "valor abaixo de R$ 50.000" → 49.999 é YES, 50.000 é NO, 50.001 é NO.
- "Acima de X", "maior que X", "superior a X", "mais de X" significam ESTRITAMENTE MAIOR (>). NÃO inclui o próprio X.
- "Faixa entre X e Y" inclui ambos os limites por padrão (≥X e ≤Y), salvo a pergunta dizer o contrário.
- Se o casal declarou EXATAMENTE o valor-limite (ex: "uns 50k", "R$ 50 mil", "50 mínimo"), NÃO trate como "abaixo" nem como "acima" — trate como IGUAL ao limite. Para perguntas com "abaixo de", responda NO. Para perguntas com "acima de", responda NO.
- Quando a pergunta perguntar sobre um VALOR e o casal informou uma FAIXA (ex: "50 a 80 mil", "entre 30 e 50"), use o TETO da faixa para responder "abaixo de" e o PISO para responder "acima de", a menos que a pergunta explicite o contrário. Se a faixa toca exatamente o limite, é NO.${groupInstruction}

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
        model: input.model ?? "gpt-5.1",
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
      console.warn(`[v2 subjective_evaluator] LLM error status=${res.status}: ${errBody.substring(0, 300)}`);
      return { resolved: deterministicResolved, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
    }

    const data = await res.json();
    const usage = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const finishReason = data.choices?.[0]?.finish_reason;
    let parsed: { evaluations?: Array<{ rule_id: string; answer: string }> };
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.warn(`[v2 subjective_evaluator] JSON parse failed (finish=${finishReason}, content_len=${content.length}, usage=${JSON.stringify(usage)}): ${String(parseErr).substring(0, 200)}`);
      return { resolved: deterministicResolved, elapsed_ms: Date.now() - start, tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } };
    }
    const evaluations = parsed.evaluations ?? [];

    const resolved: Record<string, boolean> = { ...deterministicResolved };
    for (const e of evaluations) {
      if (e.rule_id) resolved[e.rule_id] = String(e.answer).toLowerCase().trim() === 'yes';
    }

    return {
      resolved,
      elapsed_ms: Date.now() - start,
      tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
    };
  } catch (err) {
    console.warn(`[v2 subjective_evaluator] caught (${(err as Error).name}): ${String(err).substring(0, 300)}`);
    return { resolved: deterministicResolved, elapsed_ms: Date.now() - start, tokens: { input: 0, output: 0 } };
  }
}
