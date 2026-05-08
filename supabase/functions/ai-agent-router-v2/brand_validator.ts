// Brand Validator (gpt-5.5-mini, t=0.1) — pós single-agent.
//
// Lê só messages[] do output do agente principal e aplica as 11 validator_rules
// (mesma estrutura da Estela, mas duplicadas pra Patricia via clone_agent).
//
// Substitui o `runValidator` da Estela (gpt-5.1) por um modelo ~10× mais barato
// e ~3× mais rápido. Latência alvo: <500ms.
//
// Output JSON forçado por response_format:json_schema (BRAND_VALIDATOR_SCHEMA).
//
// Se action=rewrite: runtime aplica `corrected_messages` (não regenera com agente
// principal — versão simples). Versão futura pode regenerar 1× pra casos complexos.
// Se action=block: runtime loga e silencia (não envia nada pro WhatsApp).
// Se action=pass: runtime envia messages originais.

import {
  BRAND_VALIDATOR_SCHEMA,
  type BrandValidatorVerdict,
} from "./prompt_schema.ts";

export interface ValidatorRule {
  id: string;
  condition: string;
  action: "block" | "correct" | "ignore";
  enabled: boolean;
}

export interface BrandValidatorInput {
  messages: Array<{ type: "text"; content: string }>;
  rules: ValidatorRule[];
  agent_name: string;
  /**
   * Optional context pra evitar falso positivo (ex: agente acabou de receber lead
   * pela primeira vez → "primeira mensagem" pra regra zero_emoji_primeiro_contato).
   */
  is_first_contact?: boolean;
  last_lead_message?: string;
}

const VALIDATOR_MODEL = "gpt-5.5-mini";
const VALIDATOR_TEMPERATURE = 0.1;
const VALIDATOR_MAX_TOKENS = 1024;

export async function validateBrandCompliance(
  input: BrandValidatorInput,
  apiKey: string,
): Promise<BrandValidatorVerdict> {
  const enabledRules = input.rules.filter((r) => r.enabled);

  if (enabledRules.length === 0 || input.messages.length === 0) {
    return {
      ok: true,
      violations: [],
      action: "pass",
      corrected_messages: [],
    };
  }

  const rulesBlock = enabledRules
    .map((r, i) => `${i + 1}. [${r.id}] (${r.action}) ${r.condition}`)
    .join("\n");

  const messagesBlock = input.messages
    .map((m, i) => `[Mensagem ${i + 1}]: ${m.content}`)
    .join("\n\n");

  const systemPrompt = `Você é o **Validador de Marca da ${input.agent_name}**. Sua única função é verificar se as mensagens geradas pelo agente principal violam alguma das regras abaixo.

## REGRAS A VALIDAR

${rulesBlock}

## CONTEXTO DA CONVERSA

- Primeira mensagem da conversa? ${input.is_first_contact ? "SIM" : "NÃO"}
- Última mensagem do lead: ${input.last_lead_message ? `"${input.last_lead_message}"` : "(não disponível)"}

## SEU JOB

1. Ler as mensagens geradas
2. Identificar QUAIS regras foram violadas (se alguma)
3. Decidir ação:
   - **pass**: nenhuma regra violada → mensagens vão pro WhatsApp como estão
   - **rewrite**: alguma regra de "correct" violada → você gera \`corrected_messages\` aplicando a correção mínima necessária. Mantenha o tom, conteúdo e estrutura. Mude só o que precisa pra cumprir a regra.
   - **block**: alguma regra de "block" violada → o agente quebrou linha vermelha (ex: mencionou IA, inventou preço). Não envia nada. \`corrected_messages\` fica vazio.

## REGRAS DE OURO

- Conservador: se em dúvida, prefere **pass**. Não corrija o que não está claramente violando.
- Se action=rewrite, **preserve a essência da mensagem**. Não reescreva tudo, só ajuste pontual.
- Não invente regras novas. Use só as ${enabledRules.length} regras listadas acima.
- A primeira mensagem do agente PODE ter as DUAS perguntas de abertura juntas (regra perguntas_desconexas tem exceção — ver red_lines do momento abertura).

Retorne JSON conforme schema.`;

  const userPrompt = `Mensagens geradas pelo agente:\n\n${messagesBlock}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VALIDATOR_MODEL,
      // GPT-5.5-mini só suporta temperature=1 (default). Omitir respeita.
      max_completion_tokens: VALIDATOR_MAX_TOKENS,
      response_format: BRAND_VALIDATOR_SCHEMA,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(
      `[brand_validator] HTTP ${response.status} from OpenAI: ${err.substring(0, 500)}`,
    );
    // Fail-safe: deixa passar se validador falha (não bloqueia mensagem do agente)
    return {
      ok: true,
      violations: [
        {
          rule_id: "_validator_error",
          reason: `Validator HTTP ${response.status}`,
        },
      ],
      action: "pass",
      corrected_messages: [],
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error(`[brand_validator] Resposta vazia do OpenAI`);
    return {
      ok: true,
      violations: [
        { rule_id: "_validator_empty", reason: "Resposta vazia" },
      ],
      action: "pass",
      corrected_messages: [],
    };
  }

  try {
    const verdict = JSON.parse(content) as BrandValidatorVerdict;

    // Sanity checks: action=rewrite mas corrected_messages vazio → cair pra pass
    if (verdict.action === "rewrite" && verdict.corrected_messages.length === 0) {
      console.warn(
        `[brand_validator] action=rewrite mas corrected_messages vazio. Caindo pra pass.`,
      );
      verdict.action = "pass";
    }

    return verdict;
  } catch (parseErr) {
    console.error(
      `[brand_validator] Falha ao parsear JSON: ${(parseErr as Error).message}. Conteúdo: ${content.substring(0, 500)}`,
    );
    return {
      ok: true,
      violations: [
        { rule_id: "_validator_parse_error", reason: "JSON inválido" },
      ],
      action: "pass",
      corrected_messages: [],
    };
  }
}
