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
  /**
   * Moment ativo + mode pra orientar o validador. Em modo `literal`, o admin
   * curou o texto-base palavra-por-palavra — combinações que parecem violar
   * regras (ex: 2 perguntas juntas) foram VALIDADAS pelo admin. Validator
   * pode apenas BLOCK (regras hard) mas NÃO reescrever.
   */
  active_moment_key?: string | null;
  active_moment_mode?: "literal" | "faithful" | "free" | null;
  active_moment_label?: string | null;
  /**
   * Instrução custom de auditoria do agente (vem de ai_agents.prompts_extra.validator).
   * Quando preenchido, é concatenado no prompt do validator depois da lista de
   * regras — permite que o admin escreva orientação meta sobre COMO o validador
   * deve raciocinar (ex: "audite princípios de caráter, não checklist").
   * Per-agente; não é regra do framework.
   */
  extra_validator_instruction?: string | null;
  /**
   * Fatos computados deterministicamente pelo router (não pelo LLM) que
   * regras semânticas do validator referenciam. Hoje suporta:
   *   - pitch_saturado: boolean — múltiplas ofertas da reunião nos últimos N turns
   *   - pitch_count_recent: number — quantas vezes apareceu
   *   - inviabilidade_economica: "abaixo_minimo_resistente" | "fronteira_defensiva"
   *   - valor_por_convidado_brl: number
   *   - pendencias_patricia: string — texto da última promessa não cumprida
   */
  context_facts?: Record<string, unknown>;
}

const VALIDATOR_MODEL = "gpt-5.1";
const VALIDATOR_TEMPERATURE = 0.1;
const VALIDATOR_MAX_TOKENS = 1024;

/**
 * Exceções de regras por momento ativo. Algumas regras estilísticas conflitam
 * com o DESIGN INTENCIONAL de certos momentos — quando esse moment está ativo,
 * o validator deve ignorar essas regras pra não bloquear comportamento correto.
 *
 * Exemplo: na abertura, Patricia PRECISA combinar apresentação + pedido de
 * nome no mesmo turno (design Welcome). Sem exceção, perguntas_desconexas
 * marca esse comportamento como violação (falso positivo).
 *
 * Adicione novas exceções aqui quando descobrir falso positivo recorrente
 * onde regra X confronta design Y de um moment específico.
 */
const MOMENT_EXCEPTIONS: Record<string, { ignored_rules: string[]; reason: string }> = {
  abertura: {
    ignored_rules: ["perguntas_desconexas"],
    reason:
      "Abertura PRECISA combinar apresentação + pedido de nome no mesmo turno por design Welcome (Patricia faz isso intencionalmente). Não marque perguntas_desconexas neste moment.",
  },
  handoff_humano_invisivel: {
    ignored_rules: ["nao_prometer_voltar_sem_handoff"],
    reason:
      "Quando o moment é handoff_humano_invisivel, o router auto-disparou request_handoff (ou Patricia disparou). Promessa de 'volto' não é vazia — handoff aconteceu de fato. Não marque essa regra neste moment.",
  },
};

/**
 * Detecção determinística de travessão real (em-dash U+2014, en-dash U+2013).
 * Substitui a regra `zero_travessoes` do validator LLM, que estava dando falso
 * positivo em palavras compostas (quarta-feira, wedding-planner).
 *
 * O LLM-juiz tinha dificuldade de distinguir hífen-de-composição de travessão
 * separador-de-frase, mesmo com a regra de ouro escrita no prompt. Regex resolve
 * sem ambiguidade: só dispara em em-dash ou en-dash, NUNCA em hífen comum (-).
 *
 * Retorna `true` se mensagem contém travessão real.
 */
function detectTravessao(content: string): boolean {
  // U+2014 (em-dash, —) e U+2013 (en-dash, –) — caracteres distintos do hífen comum
  return /[—–]/.test(content);
}

export async function validateBrandCompliance(
  input: BrandValidatorInput,
  apiKey: string,
): Promise<BrandValidatorVerdict> {
  // Filtra zero_travessoes pra ser tratada deterministicamente (regex), não pelo LLM
  const rulesForLlm = input.rules.filter((r) => r.enabled && r.id !== "zero_travessoes");
  const travessoesRule = input.rules.find((r) => r.id === "zero_travessoes" && r.enabled);

  if (rulesForLlm.length === 0 && !travessoesRule || input.messages.length === 0) {
    return {
      ok: true,
      violations: [],
      action: "pass",
      corrected_messages: [],
    };
  }

  // Detecção determinística de travessão (antes de invocar LLM)
  const travessoesViolations: Array<{ rule_id: string; reason: string }> = [];
  if (travessoesRule) {
    for (let i = 0; i < input.messages.length; i++) {
      if (detectTravessao(input.messages[i].content)) {
        travessoesViolations.push({
          rule_id: "zero_travessoes",
          reason: `Mensagem ${i + 1} contém travessão (em-dash — ou en-dash –). Substitua por vírgula, ponto ou dois-pontos.`,
        });
      }
    }
  }

  // Se só tem violação de travessão e nenhuma outra regra pro LLM, retorna direto
  if (rulesForLlm.length === 0) {
    if (travessoesViolations.length === 0) {
      return { ok: true, violations: [], action: "pass", corrected_messages: [] };
    }
    const corrected = input.messages.map((m) => ({
      type: "text" as const,
      content: m.content.replace(/[—–]/g, ","),
    }));
    return {
      ok: false,
      violations: travessoesViolations,
      action: "rewrite",
      corrected_messages: corrected,
    };
  }

  const enabledRules = rulesForLlm;

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
- Moment ativo: ${input.active_moment_key ? `\`${input.active_moment_key}\`${input.active_moment_label ? ` (${input.active_moment_label})` : ""}` : "(não informado)"}
- Modo de geração deste turno: ${input.active_moment_mode || "(não informado)"}
${input.context_facts && Object.keys(input.context_facts).length > 0 ? `
## CONTEXT_FACTS (computados pelo router, use pra avaliar regras semânticas)

${JSON.stringify(input.context_facts, null, 2)}

Estas flags são determinísticas (não veio do LLM). Regras que mencionam pitch_saturado, inviabilidade_economica, pendencias_patricia DEVEM consultar este bloco como fonte de verdade.
` : ""}

${(() => {
  const ex = input.active_moment_key && MOMENT_EXCEPTIONS[input.active_moment_key];
  if (!ex) return "";
  return `\n## EXCEÇÕES PARA O MOMENT ATIVO \`${input.active_moment_key}\`\n\nAs regras abaixo NÃO se aplicam neste moment (design intencional do agente):\n${ex.ignored_rules.map((r) => `- \`${r}\``).join("\n")}\n\nMotivo: ${ex.reason}\n\nSe a única violação detectada for de uma rule listada acima, retorne \`action: "pass"\` e NÃO inclua essa rule em \`violations[]\`. Se houver outras violações reais, processe normalmente (ignorando apenas as listadas).`;
})()}

${input.active_moment_mode === "literal"
  ? `⚠️ MODO LITERAL: o admin curou palavra-por-palavra o texto-base deste momento. Estruturas que parecem violar regras (ex: duas perguntas na mesma mensagem, frases longas) foram **validadas pelo admin** ao escolher modo literal. NÃO use ação "rewrite" neste turno — só use "block" se a mensagem viola uma red line absoluta (ex: inventou preço, mencionou que é IA). Para violações de "correct", retorne action="pass" com a violation registrada em violations[] mas NÃO mexa no texto.`
  : input.active_moment_mode === "faithful"
  ? `📌 MODO FAITHFUL: o admin curou o texto-base com tolerância de 10% de palavras. Estruturas no texto-base (perguntas, ordem) foram validadas — não trate como violação. Use rewrite só pra ajustes pontuais que não bagunçam a estrutura curada.`
  : ""}

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
${input.extra_validator_instruction ? `\n## INSTRUÇÃO ADICIONAL DO ADMIN\n\n${input.extra_validator_instruction.trim()}\n` : ""}
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

    // Salvaguarda: em modo LITERAL, admin curou o texto. Validator não tem
    // autoridade pra reescrever. Se LLM ignorou a instrução e tentou rewrite,
    // forçamos pass mantendo as violations registradas pra auditoria.
    if (verdict.action === "rewrite" && input.active_moment_mode === "literal") {
      console.warn(
        `[brand_validator] action=rewrite ignorado em modo literal (admin curou). Caindo pra pass.`,
      );
      verdict.action = "pass";
      verdict.corrected_messages = [];
    }

    // Merge detecção determinística de travessão com veredicto do LLM
    if (travessoesViolations.length > 0) {
      verdict.violations = [...verdict.violations, ...travessoesViolations];
      verdict.ok = false;
      // Aplica substituição em corrected_messages (ou cria a partir do original)
      const baseMessages = verdict.corrected_messages.length > 0
        ? verdict.corrected_messages
        : input.messages;
      verdict.corrected_messages = baseMessages.map((m) => ({
        type: "text" as const,
        content: m.content.replace(/[—–]/g, ","),
      }));
      // Se LLM tinha decidido pass, sobe pra rewrite (a menos que outro já tenha decidido block)
      if (verdict.action === "pass") {
        verdict.action = "rewrite";
      }
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
