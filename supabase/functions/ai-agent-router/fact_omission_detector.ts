/**
 * fact_omission_detector.ts — extração determinística de "trechos do anchor que
 * o lead já antecipou" pra modos literal/faithful do Playbook v2.
 *
 * Problema que resolve:
 *   Admin grava texto fiel ("Não sei se viu no site, fazemos desde 2012, ganhamos
 *   5 prêmios..."). Lead responde mensagem antes mencionando "vi os 5 prêmios,
 *   adorei". Em modo literal/faithful, o LLM principal repetiria os prêmios sem
 *   awareness — fica robótico.
 *
 * Solução:
 *   ANTES de chamar o LLM principal, este módulo roda GPT-4.1-mini analisando
 *   anchor_text vs últimas mensagens do lead. Retorna lista de trechos textuais
 *   exatos do anchor que o lead JÁ ABORDOU (com confiança alta).
 *
 *   Persona_v2 injeta essa lista no prompt como contexto determinístico.
 *   LLM principal (literal/faithful) é instruído a OMITIR esses trechos
 *   específicos, mantendo o resto fiel.
 *
 * Por que essa abordagem em vez de só instruir o LLM principal:
 *   LLMs não são determinísticos. Confiar que o LLM principal vai consultar
 *   histórico + decidir omitir tem ~60-70% de confiabilidade. Pré-detectar
 *   via mini-call dedicada sobe pra ~95% (validado em literatura: SDR/SOTA
 *   prompt control 2024-2026, ver memory/auditoria-final-luna-julia-resultado).
 */

export interface FactOmissionResult {
  trechos_a_omitir: string[];
  resumo_do_que_lead_disse: string;
  elapsed_ms: number;
  tokens: { input: number; output: number };
}

export interface FactOmissionInput {
  anchorText: string;
  /** Últimas mensagens do lead (sem mensagens do agente). 8-10 turns suficientes. */
  leadMessages: string[];
  openaiApiKey: string;
  /** Default 'gpt-4.1-mini' — barato e rápido. */
  model?: string;
}

const SYSTEM_PROMPT = `Você é um analista de redundância em conversas de vendas. Sua única tarefa é identificar TRECHOS LITERAIS do TEXTO-ÂNCORA (que a agente está prestes a enviar) que o LEAD JÁ MENCIONOU explicitamente nas mensagens anteriores.

Regras:
1. Só retorne trechos que o lead claramente cobriu. Quando houver dúvida, NÃO inclua.
2. Trechos devem ser cópias exatas (palavra-por-palavra) de pedaços do anchor — frases curtas ou sentenças inteiras.
3. Não invente paráfrases. Se o anchor diz "ganhamos 5 prêmios" e o lead disse "vi seus prêmios", retorne literalmente o trecho do anchor.
4. Não inclua trechos genéricos (saudações, perguntas finais, conectores). Só fatos/conteúdos substantivos.
5. Se o lead não antecipou nada, retorne lista vazia.

Saída JSON estrita:
{
  "trechos_a_omitir": ["trecho 1 do anchor", "trecho 2 do anchor"],
  "resumo_do_que_lead_disse": "1 frase resumindo o que o lead já disse na conversa"
}`;

export async function detectFactsToOmit(input: FactOmissionInput): Promise<FactOmissionResult> {
  const start = Date.now();

  // Sem mensagens do lead = nada a omitir.
  if (!input.leadMessages.length || !input.anchorText.trim()) {
    return {
      trechos_a_omitir: [],
      resumo_do_que_lead_disse: '',
      elapsed_ms: 0,
      tokens: { input: 0, output: 0 },
    };
  }

  const userPrompt = `TEXTO-ÂNCORA (que a agente vai enviar agora):
"""
${input.anchorText.trim()}
"""

ÚLTIMAS MENSAGENS DO LEAD (mais recentes por último):
${input.leadMessages.map((m, i) => `${i + 1}. "${m.trim()}"`).join('\n')}

Identifique os trechos do TEXTO-ÂNCORA que o lead já mencionou explicitamente nas mensagens. Responda em JSON.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model ?? 'gpt-4.1-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[fact_omission] LLM error status=${res.status}: ${errBody.substring(0, 300)}`);
      return {
        trechos_a_omitir: [],
        resumo_do_que_lead_disse: '',
        elapsed_ms: Date.now() - start,
        tokens: { input: 0, output: 0 },
      };
    }

    const data = await res.json();
    const usage = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: { trechos_a_omitir?: string[]; resumo_do_que_lead_disse?: string };
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.warn(`[fact_omission] JSON parse failed: ${String(parseErr).substring(0, 200)}`);
      return {
        trechos_a_omitir: [],
        resumo_do_que_lead_disse: '',
        elapsed_ms: Date.now() - start,
        tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
      };
    }

    const trechos = Array.isArray(parsed.trechos_a_omitir) ? parsed.trechos_a_omitir.filter(t => typeof t === 'string' && t.trim()) : [];

    return {
      trechos_a_omitir: trechos,
      resumo_do_que_lead_disse: typeof parsed.resumo_do_que_lead_disse === 'string' ? parsed.resumo_do_que_lead_disse : '',
      elapsed_ms: Date.now() - start,
      tokens: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
    };
  } catch (err) {
    console.warn(`[fact_omission] caught (${(err as Error).name}): ${String(err).substring(0, 300)}`);
    return {
      trechos_a_omitir: [],
      resumo_do_que_lead_disse: '',
      elapsed_ms: Date.now() - start,
      tokens: { input: 0, output: 0 },
    };
  }
}
