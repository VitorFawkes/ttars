// Brand Validator (gpt-5.1, t=0.1) — pós single-agent.
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
import { resolveAgentPlaceholders } from "./placeholder_resolver.ts";

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

const VALIDATOR_MODEL = "gpt-5.1";
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

  // Resolver placeholders nas conditions (admin pode escrever {agent_name}
  // em "Estela fala preço..." → vira "Patricia fala preço..." em runtime).
  const resolverCtx = { agent_name: input.agent_name };
  const rulesBlock = enabledRules
    .map((r, i) => `${i + 1}. [${r.id}] (ação: ${r.action})\n   Violação ocorre quando: ${resolveAgentPlaceholders(r.condition, resolverCtx)}`)
    .join("\n\n");

  const messagesBlock = input.messages
    .map((m, i) => `[Mensagem ${i + 1}]: ${m.content}`)
    .join("\n\n");

  const systemPrompt = `Você é o **Validador de Marca da ${input.agent_name}**. Sua única função é checar se as mensagens geradas pelo agente principal cometem alguma das violações listadas abaixo.

## SEMÂNTICA DAS CONDIÇÕES (LEIA COM ATENÇÃO)

Cada item abaixo descreve **o que constitui uma violação**. A condição NÃO é uma obrigação — ela descreve um comportamento INDESEJADO.

- Se a condição é **VERDADEIRA** na mensagem analisada → houve **violação**, reporte em \`violations\` e use a ação indicada.
- Se a condição é **FALSA** na mensagem analisada → **regra cumprida**, NÃO reporte nada.
- A ausência do comportamento descrito é o estado normal e desejável. NUNCA reporte violação por "X não foi feito" quando a condição diz "X foi feito".

Exemplo de leitura correta:
> Regra "usa_emoji_primeiro_contato" — Violação ocorre quando: usa emoji na primeira mensagem.
>
> Mensagem do agente: "Olá, tudo bem?"  → SEM emoji → condição é FALSA → **regra cumprida**, nada a reportar.
> Mensagem do agente: "Olá! 😊"  → COM emoji → condição é VERDADEIRA → violação, reporte.

## CONDIÇÕES DE VIOLAÇÃO

${rulesBlock}

## CONTEXTO DA CONVERSA

- Primeira mensagem da conversa? ${input.is_first_contact ? "SIM" : "NÃO"}
- Última mensagem do lead: ${input.last_lead_message ? `"${input.last_lead_message}"` : "(não disponível)"}

## SEU JOB

1. Para cada mensagem gerada, leia o conteúdo com atenção.
2. Para cada condição acima, avalie: **a condição é verdadeira nesta mensagem?**
   - Sim → violação real → adiciona ao \`violations\` com \`rule_id\` e \`reason\` específica do que aconteceu na mensagem.
   - Não → regra cumprida, ignora.
3. Decidir ação geral:
   - **pass**: nenhuma violação real → mensagens vão pro WhatsApp como estão.
   - **rewrite**: ao menos uma regra de ação "correct" foi de fato violada → gera \`corrected_messages\` aplicando a correção mínima. Preserva tom, conteúdo e estrutura.
   - **block**: ao menos uma regra de ação "block" foi de fato violada → agente quebrou linha vermelha (ex: mencionou que é IA, inventou preço). \`corrected_messages\` fica vazio.

## REGRAS DE OURO

- **Conservador na inversão**: se a condição descreve um comportamento e a mensagem NÃO tem esse comportamento, **regra cumprida**. Nunca trate ausência como violação.
- **Em dúvida sobre interpretação?** Prefira \`pass\`. Só reporte quando a condição é claramente verdadeira.
- Se ação=rewrite, preserva a essência. Ajuste pontual, não reescreva tudo.
- Não invente regras novas. Use só as ${enabledRules.length} condições listadas.
- A primeira mensagem do agente PODE ter as DUAS perguntas de abertura juntas (regra perguntas_desconexas tem exceção — ver red_lines do momento abertura).

Retorne JSON conforme schema. Se nenhuma condição é verdadeira, retorne \`violations: []\` e \`action: "pass"\`.`;

  const userPrompt = `Mensagens geradas pelo agente:\n\n${messagesBlock}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VALIDATOR_MODEL,
      temperature: VALIDATOR_TEMPERATURE,
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
