// Monta o prompt único do single-agent (Patricia).
//
// Diferenças vs prompt_builder_v2.ts da Estela:
//   - TODOS os momentos visíveis em uma tabela (não só o "detectado")
//   - Modos literal/faithful/free como HINTS textuais (não short-circuit)
//   - Sem rendering condicional por modo (LLM decide)
//   - Sem fact_omission_detector (LLM percebe via histórico que lead já mencionou X)
//   - Output schema reminder no fim
//
// Output: { system: string, user: string } pra montar `messages` da OpenAI.

import type {
  BoundariesConfig,
  IdentityConfig,
  ListeningConfig,
  PlaybookFewShotExample,
  PlaybookMoment,
  PlaybookSilentSignal,
  ScoringRule,
  VoiceConfig,
} from "./playbook_loader.ts";
import { resolveMomentParts } from "./playbook_loader.ts";
import { resolvePlaceholdersDeep, type ResolverContext } from "./placeholder_resolver.ts";

export interface BuildSinglePromptInput {
  agent: {
    id: string;
    nome: string;
    identity_config: IdentityConfig | null;
    voice_config: VoiceConfig | null;
    boundaries_config: BoundariesConfig | null;
    listening_config: ListeningConfig | null;
  };
  business: {
    company_name?: string | null;
    company_description?: string | null;
    methodology_text?: string | null;
    process_steps?: unknown[];
    secondary_contact_role_name?: string | null;
  } | null;
  moments: PlaybookMoment[];
  silentSignals: PlaybookSilentSignal[];
  fewShotExamples: PlaybookFewShotExample[];
  scoringRules: ScoringRule[];
  scoringThreshold: number;
  conversationState: {
    historico_compacto: string;
    last_lead_message: string | null;
    last_moment_key: string | null;
    /**
     * Em moments com delivery_mode=wait_for_reply e anchor_text_parts com 2+
     * elementos, este step indica qual parte enviar no turno atual. Quando o
     * último moment terminou (lead respondeu à última parte), o router avança
     * step+1 ANTES de chamar o LLM. Default 0 (primeiro bloco).
     */
    moment_step: number;
    turn_count: number;
    is_primeiro_contato: boolean;
    contact_name: string | null;
    card_titulo: string | null;
    ai_resumo: string | null;
    ai_contexto: string | null;
    card_form_data: Record<string, unknown> | null;
    /**
     * Quando o router pré-decide o momento (ex: trigger determinístico de
     * desfecho ao fim da sondagem), envia o slug aqui. O turn_policy força
     * o LLM a usar esse momento — sem chance de "esquecer" de fechar.
     * null = LLM decide normalmente.
     */
    forced_moment_key?: string | null;
    /**
     * Resultado da RPC calculate_agent_qualification_score, chamada pelo
     * router antes do LLM quando os dados estão coletados. Quando presente,
     * é renderizado como contexto autoritativo no prompt.
     */
    qualification_result?: {
      score: number;
      qualificado: boolean;
      breakdown?: unknown;
    } | null;
    /**
     * Lista de 3 dias/horários propostos pra reunião com a Wedding Planner.
     * Buscada pelo router quando o trigger determinístico identifica
     * desfecho_qualificado. LLM apresenta esses horários verbatim no
     * último turno da conversa.
     */
    proposed_slots?: Array<{ date: string; time: string; weekday: string }> | null;
    /**
     * Resultados de tools executadas no MESMO turn anterior (agentic loop).
     * Quando o LLM chama uma tool e queremos que ele use o resultado pra
     * gerar a resposta, o router executa, popula isto e re-chama o LLM.
     * Hoje só `check_calendar` usa esse caminho.
     */
    tool_results?: Record<string, unknown> | null;
  };
  availableTools: string[];
}

export function buildSinglePrompt(input: BuildSinglePromptInput): {
  system: string;
  user: string;
} {
  const {
    agent,
    business,
    moments: rawMoments,
    silentSignals: rawSignals,
    fewShotExamples: rawExamples,
    scoringRules: rawScoringRules,
    scoringThreshold,
    conversationState,
    availableTools,
  } = input;

  // Resolver placeholders {agent_name}, {company_name}, {contact_name} em
  // todos os textos editáveis pelo admin antes de injetar no prompt.
  // Idempotente: se admin escreveu literal "Patricia" em vez de placeholder,
  // passa intocado. Histórico do lead e mensagens persistidas NÃO são tocadas.
  const resolverCtx: ResolverContext = {
    agent_name: agent.nome,
    company_name: business?.company_name ?? null,
    contact_name: conversationState.contact_name ?? null,
  };

  const identity = resolvePlaceholdersDeep(agent.identity_config || {}, resolverCtx);
  const voice = resolvePlaceholdersDeep(agent.voice_config || {}, resolverCtx);
  const boundaries = resolvePlaceholdersDeep(agent.boundaries_config || {}, resolverCtx);
  const listening = resolvePlaceholdersDeep(agent.listening_config || {}, resolverCtx);
  const resolvedBusiness = business ? resolvePlaceholdersDeep(business, resolverCtx) : null;
  const moments = rawMoments.map((m) => resolvePlaceholdersDeep(m, resolverCtx));
  const silentSignals = rawSignals.map((s) => resolvePlaceholdersDeep(s, resolverCtx));
  const fewShotExamples = rawExamples.map((e) => resolvePlaceholdersDeep(e, resolverCtx));
  const scoringRules = rawScoringRules.map((r) => resolvePlaceholdersDeep(r, resolverCtx));

  // -------- Header / identity ---------------------------------------------
  const headerBlock = renderHeader(agent.nome, identity, resolvedBusiness);

  // -------- Voice ---------------------------------------------------------
  const voiceBlock = renderVoice(voice);

  // -------- Boundaries ----------------------------------------------------
  const boundariesBlock = renderBoundaries(boundaries);

  // -------- Listening -----------------------------------------------------
  const listeningBlock = renderListening(listening);

  // -------- Playbook (TODOS os momentos) ----------------------------------
  const playbookBlock = renderPlaybook(moments, conversationState);

  // -------- Silent signals ------------------------------------------------
  const silentSignalsBlock = renderSilentSignals(silentSignals);

  // -------- Qualification (regras como referência) ------------------------
  const qualificationBlock = renderQualification(scoringRules, scoringThreshold);

  // -------- Few-shot examples ---------------------------------------------
  const examplesBlock = renderFewShots(fewShotExamples);

  // -------- Conversation state --------------------------------------------
  const stateBlock = renderConversationState(conversationState);

  // -------- Qualification result (contexto autoritativo do router) ---------
  // Quando o router rodou a RPC determinística antes do LLM, este bloco
  // entrega o resultado já calculado. LLM não precisa (e não deve) chamar
  // calculate_qualification_score novamente.
  const qualificationResultBlock = renderQualificationResult(conversationState.qualification_result);

  // -------- Proposed slots (3 horários pra reunião) -----------------------
  // Quando o trigger determinístico identifica desfecho_qualificado, o
  // router pré-busca 3 horários e injeta aqui. LLM apresenta verbatim.
  const proposedSlotsBlock = renderProposedSlots(conversationState.proposed_slots);

  // -------- Tool results (agentic loop curto) -----------------------------
  // Quando o router executou uma tool e está re-chamando o LLM pra usar o
  // resultado, popula este bloco com a saída da tool. Hoje cobre só
  // check_calendar — a Patricia usa o retorno pra responder ao lead.
  const toolResultsBlock = renderToolResults(conversationState.tool_results);

  // -------- Turn policy (regra do bloco ativo nesse turno) ----------------
  const turnPolicyBlock = renderTurnPolicy(moments, conversationState);

  // -------- Tools available -----------------------------------------------
  const toolsBlock = renderTools(availableTools);

  // -------- Output schema reminder ----------------------------------------
  const schemaReminder = renderSchemaReminder();

  const system = [
    headerBlock,
    voiceBlock,
    boundariesBlock,
    listeningBlock,
    playbookBlock,
    silentSignalsBlock,
    qualificationBlock,
    examplesBlock,
    stateBlock,
    qualificationResultBlock,
    proposedSlotsBlock,
    toolResultsBlock,
    turnPolicyBlock,
    toolsBlock,
    schemaReminder,
  ]
    .filter(Boolean)
    .join("\n\n");

  // User message é a última mensagem do lead (ou placeholder se não houver)
  const user = conversationState.last_lead_message ||
    "(Lead não enviou mensagem ainda — você está iniciando a conversa.)";

  return { system, user };
}

// ============================================================================
// Renderers
// ============================================================================

function renderHeader(
  agentName: string,
  identity: IdentityConfig,
  business: BuildSinglePromptInput["business"],
): string {
  const role = identity.role_custom || identity.role || "atendente";
  const mission = identity.mission_one_liner || "";
  const companyDesc =
    identity.company_description_override ||
    business?.company_description ||
    "";

  let methodology = business?.methodology_text || "";
  if (business?.process_steps && Array.isArray(business.process_steps) && business.process_steps.length > 0) {
    const steps = (business.process_steps as string[])
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    methodology += methodology ? `\n\nNosso processo:\n${steps}` : `Nosso processo:\n${steps}`;
  }

  return `<identity>
Você é ${agentName}, ${role} da ${business?.company_name || ""}.

Missão: ${mission}

${companyDesc}

${methodology}
</identity>`;
}

function renderVoice(voice: VoiceConfig): string {
  const toneTags = voice.tone_tags?.join(", ") || "";
  const rules = voice.rules || voice.custom_rules || [];
  const typicalPhrases = voice.typical_phrases || [];
  const forbiddenPhrases = voice.forbidden_phrases || [];

  let regionalisms = "";
  if (voice.regionalisms) {
    const r = voice.regionalisms;
    const parts: string[] = [];
    if (r.uses_a_gente) parts.push('Use "a gente" sempre, nunca "nós"');
    if (r.uses_voces_casal) parts.push('Use "vocês" pra falar com o casal');
    if (r.uses_gerundio === false) parts.push("Evite gerúndio (estou fazendo → faço)");
    if (r.casual_tu_mano === false) parts.push('Não use "tu", "mano", "cara"');
    if (parts.length) regionalisms = parts.map((p) => `- ${p}`).join("\n");
  }

  let emojiRule = "";
  if (voice.emoji_policy === "never") {
    emojiRule = "- ZERO emoji em qualquer mensagem";
  } else if (voice.emoji_policy === "after_rapport") {
    emojiRule = "- Zero emoji na PRIMEIRA mensagem (antes de estabelecer rapport). Depois, máx 1 por mensagem.";
  }

  return `<voice>
Tom: ${toneTags}
Formalidade (1=informal, 5=formal): ${voice.formality ?? 3}

Regras de tom:
${rules.map((r) => `- ${r}`).join("\n")}
${regionalisms ? "\n" + regionalisms : ""}
${emojiRule ? "\n" + emojiRule : ""}

Frases típicas (use natural, não force):
${typicalPhrases.map((p) => `- "${p}"`).join("\n")}

Frases proibidas (NUNCA usar):
${forbiddenPhrases.map((p) => `- "${p}"`).join("\n")}
</voice>`;
}

function renderBoundaries(boundaries: BoundariesConfig): string {
  const libraryActive = boundaries.library_active || [];
  const custom = boundaries.custom || [];
  const customByCat = boundaries.custom_by_category || {};

  // Mapeamento da biblioteca padrão (mesmo nomes que a Estela usa em prod)
  const LIBRARY_DESCRIPTIONS: Record<string, string> = {
    never_price: "NUNCA fale preço ou valor do serviço — apenas a especialista humana fala isso na reunião",
    never_transfer_explicit: "NUNCA diga 'vou passar', 'vou transferir', 'outra pessoa vai te atender' — handoff é invisível",
    never_ai_mention: "NUNCA mencione IA, robô, modelo, prompt, agente, chatbot, sistema, bastidores, automação",
    never_invent: "NUNCA dê informação sobre destino, política, prazo ou pacote sem ter chamado search_knowledge_base",
    never_cliche: "NUNCA use clichês: 'casamento dos sonhos', 'experiência premium', 'deixe conosco', 'transformamos sonhos em realidade'",
    never_emoji_first: "ZERO emoji na primeira mensagem (rapport ainda não estabelecido)",
    never_dash_separator: "ZERO travessões (—) ou hífens longos como separador de frases. Use vírgula, ponto, reticências",
    never_promise_deadline: "NUNCA prometa prazo específico (vou te responder em X minutos, etc)",
    never_negotiate_writing: "NUNCA negocie por escrito — negociação é só com a especialista humana",
    never_mention_competitor: "NUNCA mencione concorrente por nome",
    never_justify_question: "NUNCA justifique excessivamente uma pergunta (\"perdão por perguntar mas...\")",
    never_blame_customer: "NUNCA culpe o cliente por algo (mesmo se ele errou)",
    never_repeat_info: "NUNCA repita informação que o lead já deu",
    never_repeat_words: "NUNCA repita as mesmas palavras 2 turnos seguidos",
    never_ask_known_data: "NUNCA pergunte dado que já está no card (form_data)",
    never_assume_in_question: "NUNCA assuma resposta na pergunta ('vocês querem casar no Caribe ou nas Maldivas?' assume região)",
  };

  const libRules = libraryActive
    .map((id) => LIBRARY_DESCRIPTIONS[id] || `(boundary desconhecida: ${id})`)
    .map((d) => `- ${d}`)
    .join("\n");

  const customByCatRules = Object.entries(customByCat)
    .map(([cat, rules]) =>
      `## ${cat}:\n${(rules as string[]).map((r) => `- ${r}`).join("\n")}`
    )
    .join("\n\n");

  return `<boundaries>
## Regras Absolutas (linha vermelha)
${libRules}

${custom.length ? `## Regras Custom\n${custom.map((c) => `- ${c}`).join("\n")}` : ""}

${customByCatRules}
</boundaries>`;
}

function renderListening(listening: ListeningConfig): string {
  const parts: string[] = [];

  if (listening.echo_social_questions) {
    parts.push(
      "- Se o lead fizer pergunta social ('e você?', 'tudo bem?'), responda BREVEMENTE antes de seguir o roteiro. Ignorar = falha de educação básica.",
    );
  }
  if (listening.acknowledge_observations) {
    parts.push(
      "- Se o lead fizer observação espontânea (algo fora do funil), reconheça em 1 frase antes de continuar.",
    );
  }
  if (listening.handle_message_bursts) {
    parts.push(
      "- Se o lead mandar 3+ mensagens curtas seguidas, leia TODAS antes de responder. Não responda só a última.",
    );
  }
  if (listening.never_ignore_lead) {
    parts.push(
      "- Se o lead trouxe novidade não pedida (ex: revelou nome, data, destino), reconheça antes de avançar.",
    );
  }

  if (listening.examples?.length) {
    parts.push("\nExemplos de escuta ativa:");
    listening.examples.forEach((ex) => parts.push(`  - ${ex}`));
  }

  if (parts.length === 0) return "";

  return `<listening>
Você responde de forma humana, não como formulário sequencial.
${parts.join("\n")}
</listening>`;
}

function renderPlaybook(
  moments: PlaybookMoment[],
  state?: BuildSinglePromptInput["conversationState"],
): string {
  // Quando o moment ativo é wait_for_reply sequenciado, mascara os blocos
  // futuros do moment atual no playbook geral. O LLM continua sabendo que
  // existem N blocos, mas só vê o conteúdo do bloco ativo aqui (também
  // detalhado no <turn_policy>). Sem isso, o modo literal copia todos os
  // blocos de uma vez. Outros moments seguem renderizados por completo.
  const activeKey = state?.last_moment_key ?? null;
  const activeStep = state?.moment_step ?? 0;
  if (moments.length === 0) {
    return `<playbook>
(Nenhum momento configurado. Aja com base na identity, voice, boundaries.)
</playbook>`;
  }

  const modeHint: Record<string, string> = {
    literal:
      "⚠️ LITERAL: copie o anchor_text PALAVRA-POR-PALAVRA. Admin curou cada caractere. Não mude estilo, tom, emoji, ordem.",
    faithful:
      "📌 FAITHFUL: o anchor é guia semântico (~90% cobertura). Mantenha estrutura e frases-chave, adapte tom se necessário pra soar natural.",
    free:
      "🎯 FREE: o anchor é inspiração. Capture a essência mas use suas próprias palavras, respeitando red_lines.",
  };

  const triggerDesc = (m: PlaybookMoment): string => {
    if (m.trigger_type === "primeiro_contato") return "primeiro contato (lead nunca conversou antes)";
    if (m.trigger_type === "lead_respondeu") return "lead respondeu (qualquer mensagem após abertura)";
    if (m.trigger_type === "always") return "sempre (fallback final)";
    if (m.trigger_type === "manual") return "manual (decisão sua)";
    if (m.trigger_type === "keyword") {
      const kws = (m.trigger_config as { keywords?: string[] })?.keywords || [];
      return `keyword (${kws.slice(0, 8).join(", ")}${kws.length > 8 ? ", …" : ""})`;
    }
    if (m.trigger_type === "score_threshold") {
      const cfg = m.trigger_config as { value?: number; operator?: string };
      return `score ${cfg.operator || ">="} ${cfg.value || "?"}`;
    }
    return m.trigger_type;
  };

  const renderOne = (m: PlaybookMoment, idx: number): string => {
    const lines: string[] = [];
    lines.push(`### ${idx + 1}. ${m.moment_label} (\`${m.moment_key}\`)`);
    lines.push(`- **Quando aplicar:** ${triggerDesc(m)}`);
    lines.push(`- **Tipo:** ${m.kind === "flow" ? "FLOW (fase do funil, sequencial)" : "PLAY (jogada situacional, interrompe pra atender e volta)"}`);
    if (m.intent) lines.push(`- **Intenção:** ${m.intent}`);
    lines.push(`- **Modo:** ${modeHint[m.message_mode] || m.message_mode}`);
    const parts = resolveMomentParts(m);
    const isSequencedWait = m.delivery_mode === "wait_for_reply" && parts.length > 1;
    const isActiveMoment = activeKey === m.moment_key;
    if (isSequencedWait) {
      lines.push(`- **Sequência de blocos** (${parts.length} blocos, um por rodada de envio — espera resposta do lead entre cada):`);
      parts.forEach((p, i) => {
        // Quando é o moment ATIVO, mascara blocos diferentes do ativo pra
        // evitar que o LLM copie conteúdo futuro de uma vez. O bloco ativo
        // continua visível aqui E também no <turn_policy>.
        if (isActiveMoment && i !== activeStep) {
          lines.push(`  - **Bloco ${i + 1} de ${parts.length}:** (texto mascarado — virá em turno futuro quando o router avançar pra este bloco)`);
        } else {
          lines.push(`  - **Bloco ${i + 1} de ${parts.length}:**${isActiveMoment && i === activeStep ? " ← VOCÊ ESTÁ AQUI NESTE TURNO" : ""}`);
          lines.push("    ```");
          p.split("\n").forEach((line) => lines.push(`    ${line}`));
          lines.push("    ```");
        }
      });
    } else if (m.anchor_text) {
      lines.push(`- **Anchor text:**`);
      lines.push("  ```");
      m.anchor_text.split("\n").forEach((line) => lines.push(`  ${line}`));
      lines.push("  ```");
    }
    if (m.must_cover?.length) {
      lines.push(`- **Pontos a cobrir (must_cover):**`);
      m.must_cover.forEach((p) => lines.push(`  - ${p}`));
    }
    if (m.literal_phrases?.length) {
      lines.push(`- **Frases obrigatórias (literal_phrases):**`);
      m.literal_phrases.forEach((p) => lines.push(`  - "${p}"`));
    }
    if (m.red_lines?.length) {
      lines.push(`- **Red lines (NUNCA fazer):**`);
      m.red_lines.forEach((r) => lines.push(`  - ${r}`));
    }
    if (m.collects_fields?.length) {
      lines.push(`- **Coleta os campos:** ${m.collects_fields.join(", ")}`);
    }
    if (m.discovery_config?.slots?.length) {
      lines.push(`- **Slots de descoberta:**`);
      m.discovery_config.slots.forEach((s) => {
        lines.push(`  - \`${s.crm_field_key}\` ${s.required ? "(obrigatório)" : "(opcional)"}: ${s.label}`);
        if (s.questions?.length) {
          lines.push(`    Perguntas exemplo: ${s.questions.map((q) => `"${q}"`).join(" | ")}`);
        }
      });
    }
    if (m.delivery_mode === "wait_for_reply") {
      lines.push(`- **Entrega:** UMA mensagem só, espera lead responder antes de seguir.`);
    }
    return lines.join("\n");
  };

  const flow = moments.filter((m) => m.kind === "flow");
  const play = moments.filter((m) => m.kind === "play");

  let block = `<playbook>
Você tem ${moments.length} momentos. Decida QUAL aplicar AGORA com base no estado da conversa, gatilhos abaixo e raciocínio próprio.

## FLOW (fases sequenciais do funil — siga ordem natural)

${flow.map((m, i) => renderOne(m, i)).join("\n\n")}

`;

  if (play.length) {
    block += `## PLAY (jogadas situacionais — interrompem o flow quando gatilho bate)

${play.map((m, i) => renderOne(m, i)).join("\n\n")}

`;
  }

  block += `## REGRAS DE TRANSIÇÃO

- Não mude de momento por impulso. Se está em FLOW, fica até completar slots críticos.
- PLAY interrompe FLOW quando gatilho bate (ex: lead pergunta preço → objecao_preco). Depois do PLAY, volta pro FLOW que estava.
- Em momento LITERAL, copie o anchor sem mudar. Em FAITHFUL, mantenha estrutura. Em FREE, gere natural respeitando red_lines.
- Se não tiver certeza qual aplicar, escolha o último FLOW conhecido OU o flow mais recente que faça sentido.
</playbook>`;

  return block;
}

function renderSilentSignals(signals: PlaybookSilentSignal[]): string {
  if (signals.length === 0) return "";

  return `<silent_signals>
Sinais que você detecta em SILÊNCIO (registra no card via card_patch, NUNCA comenta na conversa):

${signals.map((s, i) => {
    const lines: string[] = [];
    lines.push(`${i + 1}. **${s.signal_label}** (\`${s.signal_key}\` → \`${s.crm_field_key}\`)`);
    lines.push(`   - Como detectar: ${s.detection_hint}`);
    if (s.how_to_use) lines.push(`   - Como usar: ${s.how_to_use}`);
    return lines.join("\n");
  }).join("\n\n")}
</silent_signals>`;
}

function renderQualification(rules: ScoringRule[], threshold: number): string {
  if (rules.length === 0) {
    return `<qualification>
Não há regras de scoring configuradas. Decida qualificação por feeling, baseando-se em sinais como destino mainstream/exótico, tamanho do convite, sinais de poder aquisitivo.
</qualification>`;
  }

  const qualify = rules.filter((r) => r.rule_type === "qualify");
  const disqualify = rules.filter((r) => r.rule_type === "disqualify");
  const bonus = rules.filter((r) => r.rule_type === "bonus");

  const renderRule = (r: ScoringRule): string => {
    const cv = r.condition_value as Record<string, unknown>;
    let desc = r.label || r.dimension;
    if (cv.formula === "value_per_guest") {
      const min = cv.min as number | null;
      const max = cv.max as number | null;
      if (max == null) desc = `Valor por convidado >= R$ ${min}`;
      else desc = `Valor por convidado entre R$ ${min} e R$ ${max}`;
    } else if (cv.formula === "budget_below") {
      desc = `Orçamento total < R$ ${cv.value}`;
    } else if (cv.formula === "budget_above") {
      desc = `Orçamento total > R$ ${cv.value}`;
    } else if (cv.question) {
      desc = `${desc}: ${(cv.question as string).substring(0, 200)}`;
    }
    return `- (${r.weight > 0 ? "+" : ""}${r.weight}) ${desc}`;
  };

  return `<qualification>
Threshold pra qualificar: **${threshold} pontos**.

## Como funciona
Você NÃO calcula a nota. Quando precisar saber se o casal qualifica, chame a tool **calculate_qualification_score** com os campos do card (\`form_data\`). O servidor aplica fórmulas determinísticas e retorna \`{score, breakdown, qualificado}\`.

## Regras (referência — NÃO calcule sozinho)

### Pontos pra qualificar:
${qualify.map(renderRule).join("\n")}

${bonus.length ? `### Bônus:\n${bonus.map(renderRule).join("\n")}\n` : ""}
${disqualify.length ? `### Desqualifica (peso 0 mas marca como red flag):\n${disqualify.map(renderRule).join("\n")}\n` : ""}

## Quando chamar a tool
- Ao final da Sondagem (já tem destino + data + convidados + investimento)
- Quando lead revela info nova que muda score (ex: confirma viagem internacional recente, família ajuda)
- Antes de decidir entre desfecho_qualificado vs desfecho_nao_qualificado
</qualification>`;
}

function renderFewShots(examples: PlaybookFewShotExample[]): string {
  if (examples.length === 0) return "";

  return `<examples>
Exemplos curados pelo admin (referência de tom + estrutura — não copiar literal):

${examples.slice(0, 5).map((ex, i) => {
    return `### Exemplo ${i + 1}${ex.related_moment_key ? ` (momento: ${ex.related_moment_key})` : ""}
Lead: "${ex.lead_message}"
Você: "${ex.agent_response}"
${ex.context_note ? `Contexto: ${ex.context_note}` : ""}`;
  }).join("\n\n")}
</examples>`;
}

function renderConversationState(
  state: BuildSinglePromptInput["conversationState"],
): string {
  const formDataLines: string[] = [];
  if (state.card_form_data) {
    Object.entries(state.card_form_data)
      .filter(([_, v]) => v != null && v !== "" && v !== false)
      .slice(0, 30)
      .forEach(([k, v]) => {
        formDataLines.push(`  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
      });
  }

  return `<conversation_state>
- **Turno:** ${state.turn_count}${state.is_primeiro_contato ? " (PRIMEIRO CONTATO)" : ""}
- **Contato (lead):** ${state.contact_name || "(nome ainda não revelado)"}
- **Card:** ${state.card_titulo || "(sem título)"}
- **Último momento:** ${state.last_moment_key || "(nenhum)"}

## Resumo IA (atualizado pelo turno anterior)
${state.ai_resumo || "(vazio — primeiro contato ou conversa nova)"}

## Contexto IA (atualizado pelo turno anterior)
${state.ai_contexto || "(vazio)"}

## Dados estruturados do card (form_data)
${formDataLines.length > 0 ? formDataLines.join("\n") : "(card sem campos preenchidos ainda)"}

## Histórico compacto da conversa
${state.historico_compacto || "(sem histórico — primeiro contato)"}
</conversation_state>`;
}

/**
 * Renderiza o resultado da RPC de scoring quando o router chamou determinístico
 * antes do LLM. Quando presente, o LLM tem o score já calculado como
 * contexto autoritativo — NÃO precisa (nem deve) chamar a tool de novo.
 */
function renderQualificationResult(
  result: BuildSinglePromptInput["conversationState"]["qualification_result"] | undefined,
): string {
  if (!result) return "";
  const status = result.qualificado ? "✅ QUALIFICOU" : "❌ NÃO QUALIFICOU";
  const breakdownStr = result.breakdown
    ? `\n\n## Breakdown\n\`\`\`json\n${JSON.stringify(result.breakdown, null, 2)}\n\`\`\``
    : "";
  return `<qualification_result>
🎯 SCORE JÁ CALCULADO PELO ROUTER (use como contexto autoritativo, NÃO chame a tool de novo)

- **Status:** ${status}
- **Score:** ${result.score}${breakdownStr}

Este resultado é fonte de verdade. Use-o pra decidir o desfecho. O \`turn_policy\` abaixo já vai te dizer qual momento usar.
</qualification_result>`;
}

/**
 * Renderiza os 3 horários propostos quando o router decidiu desfecho_qualificado.
 * LLM deve apresentar verbatim na mensagem final, oferecendo escolha ao casal.
 */
/**
 * Renderiza resultados de tools executadas pelo router antes desta chamada
 * do LLM (agentic loop curto). Quando presente, o LLM DEVE basear sua
 * resposta nesses resultados, sem inventar.
 *
 * Hoje cobre check_calendar (negociação de data fora dos slots iniciais).
 */
function renderToolResults(
  results: BuildSinglePromptInput["conversationState"]["tool_results"] | undefined,
): string {
  if (!results || Object.keys(results).length === 0) return "";
  const lines: string[] = [];
  for (const [toolName, payload] of Object.entries(results)) {
    if (toolName === "check_calendar") {
      const r = payload as { slots_disponiveis?: Array<{ date: string; time: string; weekday: string }>; note?: string | null };
      const slots = r.slots_disponiveis || [];
      const note = r.note || null;
      lines.push(`📅 **check_calendar** retornou:`);
      if (slots.length === 0) {
        lines.push(`- Nenhum horário disponível na data/range solicitado.`);
        if (note) lines.push(`- Motivo: ${note}`);
        lines.push(`- ⚠️ Explique honestamente ao lead (use o motivo acima) e ofereça outra data próxima. NÃO re-ofereça os mesmos slots originais de \`<proposed_slots>\`.`);
      } else {
        lines.push(`- Horários reais encontrados pela agenda da Wedding Planner:`);
        for (const s of slots) {
          lines.push(`  - *${s.weekday} ${s.date}* às *${s.time}*`);
        }
        if (note) lines.push(`- Observação: ${note}`);
        lines.push(`- ✅ Apresente estes horários ao lead. Eles SUBSTITUEM os de \`<proposed_slots>\` agora. Quando o lead escolher um deles, chame \`confirm_meeting_slot\` com a date+time correspondente.`);
      }
    } else {
      // Outras tools: render genérico
      lines.push(`📦 **${toolName}** retornou: \`${JSON.stringify(payload)}\``);
    }
  }
  return `<tool_results>
🛠️ Resultados de tools que o router já executou ANTES desta resposta. Use estes dados como fonte de verdade.

${lines.join("\n")}
</tool_results>`;
}

function renderProposedSlots(
  slots: BuildSinglePromptInput["conversationState"]["proposed_slots"] | undefined,
): string {
  if (!slots || slots.length === 0) return "";
  // Formato bold WhatsApp: *texto* (asterisco simples). WhatsApp não renderiza
  // Markdown **texto**. Padronizar aqui evita LLM ter que traduzir formato
  // (que vinha embolando — bug 2026-05-13: *qui... ,**sex...*).
  const lines = slots
    .map((s, i) => `  ${i + 1}. *${s.weekday} ${s.date}* às *${s.time}*`)
    .join("\n");
  return `<proposed_slots>
📅 HORÁRIOS DA WEDDING PLANNER (pré-buscados pelo router, use verbatim)

${lines}

Apresente os 3 horários ao casal exatamente como acima e peça pra escolher um. NÃO invente outras opções. NÃO mude o formato dos dias/horários. Os asteriscos simples (\`*texto*\`) são a sintaxe de bold do WhatsApp — preserve EXATAMENTE assim, sem dobrar pra \`**\` e sem remover. Se o casal pedir alternativa, diga que vai checar e siga.
</proposed_slots>`;
}

/**
 * Bloco que diz ao LLM qual é o "bloco ativo" deste turno e como se comportar
 * frente aos blocos seguintes (caso o momento atual seja sequenciado wait_for_reply).
 *
 * O router pré-calcula `moment_step` antes de chamar o LLM:
 *   - 0 = primeiro bloco do moment OU moment não-sequenciado
 *   - N = está retornando ao mesmo moment depois do lead responder; envie o N-ésimo bloco
 *
 * O LLM continua livre para mudar de moment (escolher current_moment_key diferente
 * do last_moment_key). Nesse caso o router reseta o step para 0 automaticamente.
 *
 * **Forced moment** (novo): quando o router pré-decide um momento via trigger
 * determinístico (ex: desfecho_qualificado ao fim da sondagem), `forced_moment_key`
 * sobrescreve a escolha do LLM. Útil pra garantir que conversas terminem com
 * proposta concreta de reunião, e não em "deu pra entender o cenário".
 */
function renderTurnPolicy(
  moments: PlaybookMoment[],
  state: BuildSinglePromptInput["conversationState"],
): string {
  // -------- Forced moment (trigger determinístico do router) --------------
  // Tem prioridade sobre last_moment_key. LLM DEVE usar esse momento.
  const forcedKey = state.forced_moment_key;
  if (forcedKey) {
    const forced = moments.find((m) => m.moment_key === forcedKey);
    if (forced) {
      const parts = resolveMomentParts(forced);
      let baseText = parts[0] || forced.anchor_text || "";
      // Substitui placeholder {slots_disponiveis} pela lista formatada
      // dos horários reais. Sem isso, LLM tenta interpretar o placeholder
      // como variável literal e às vezes colava "<proposed_slots>" na
      // resposta. Formato WhatsApp: *qui 14/05 às 10:00*, *qui 14/05 às 14:00*…
      if (baseText.includes("{slots_disponiveis}") && state.proposed_slots && state.proposed_slots.length > 0) {
        const formattedSlots = state.proposed_slots
          .map((s) => `*${s.weekday} ${s.date}* às *${s.time}*`)
          .join(", ");
        baseText = baseText.replaceAll("{slots_disponiveis}", formattedSlots);
      }
      const isLiteral = forced.message_mode === "literal";
      const isFaithful = forced.message_mode === "faithful";
      const modeNote = isLiteral
        ? "Modo LITERAL: copie verbatim. Cada palavra foi curada."
        : isFaithful
        ? "Modo FAITHFUL: até 10% pode trocar pra fluir, estrutura e perguntas idênticas."
        : "Modo FREE: capture a essência com suas palavras, mas mantenha estrutura.";

      return `<turn_policy>
🎯 ESTRATÉGIA DESTE TURNO — MOMENTO FORÇADO PELO ROUTER

O router já decidiu por você: o momento deste turno é **\`${forced.moment_key}\`** (${forced.moment_label}).
Isso aconteceu porque o estado da conversa (dados coletados + score calculado) bate exatamente com a condição deste momento. Não há ambiguidade.

═══ TEXTO-BASE DO MOMENTO ═══
${baseText}
═══ FIM DO TEXTO-BASE ═══

⛔ REGRAS:
- ${modeNote}
- Marque \`current_moment_key\` = "${forced.moment_key}".
- NÃO chame a tool \`calculate_qualification_score\` — o router já calculou e o resultado está em \`<qualification_result>\`.
${state.proposed_slots && state.proposed_slots.length > 0
  ? `- Apresente TODOS os ${state.proposed_slots.length} horários de \`<proposed_slots>\` verbatim e peça pro casal escolher um. Cada slot tem date+time exatos — não omita nenhum.
- ⚠️ AGENDAMENTO: quando o casal escolher/aceitar um dos horários, a ÚNICA tool válida é \`confirm_meeting_slot\` com { date, time } da escolha exata. NUNCA use \`create_task\` pra agendar reunião com a Wedding Planner — \`create_task\` é só pra tarefas internas administrativas.
- Sem chamar a tool, a reunião NÃO entra na agenda real da Wedding Planner — só você sabe. Sempre chame a tool ao confirmar.
- 🔄 NEGOCIAÇÃO DE DATA: se o casal pedir uma data ou horário FORA dos slots de \`<proposed_slots>\` (ex: 'tem dia 17?', 'antes de quinta?', 'na semana que vem?', 'manhã do dia 20?'), CHAME a tool \`check_calendar\` com a data/range que o casal pediu. NÃO repita os mesmos slots originais. NÃO diga 'vou checar' sem chamar a tool. Apresente os slots retornados pela tool. Se vier vazio, leia o \`note\` e explique honestamente (ex: 'esse dia cai num domingo e a Wedding Planner não atende — quer que eu veja na segunda 18/05?').`
  : ""}
${forced.must_cover && forced.must_cover.length > 0
  ? `- Cubra todos os pontos de \`must_cover\` do momento.`
  : ""}
${forced.literal_phrases && forced.literal_phrases.length > 0
  ? `- Inclua TODAS as literal_phrases do momento integralmente.`
  : ""}

🔀 EXCEÇÃO única — se o lead acabou de mandar uma objeção FORTE ou pedido explícito que contradiz o momento forçado (ex: "não quero marcar reunião, só quero saber preço"), você pode escolher outro \`current_moment_key\` correspondente (ex: \`objecao_preco\`). Mas em conversa normal, NÃO desvie.
</turn_policy>`;
    }
  }

  const lastKey = state.last_moment_key;
  const step = state.moment_step ?? 0;

  if (!lastKey) {
    return `<turn_policy>
🎯 ESTRATÉGIA DESTE TURNO

Você está iniciando a conversa OU não havia momento anterior. Escolha o moment de FLOW apropriado (geralmente o primeiro: abertura). Use o Bloco 1 dele se houver sequência.
</turn_policy>`;
  }

  const moment = moments.find((m) => m.moment_key === lastKey);
  if (!moment) {
    return `<turn_policy>
🎯 ESTRATÉGIA DESTE TURNO

Último moment registrado ("${lastKey}") não está mais disponível no playbook. Reescolha o moment correto pelo estado da conversa.
</turn_policy>`;
  }

  const parts = resolveMomentParts(moment);
  const isSequencedWait = moment.delivery_mode === "wait_for_reply" && parts.length > 1;

  if (!isSequencedWait) {
    return `<turn_policy>
🎯 ESTRATÉGIA DESTE TURNO

Último moment: \`${moment.moment_key}\` (${moment.delivery_mode || "all_at_once"})

Esse moment NÃO tem blocos sequenciais. Você pode mudar de moment livremente se o estado pedir, ou continuar nele se a conversa ainda demanda. Decida pelo contexto.
</turn_policy>`;
  }

  const inRange = step >= 0 && step < parts.length;
  const activeIdx = inRange ? step : 0;
  const isLast = activeIdx === parts.length - 1;
  const isLiteral = moment.message_mode === "literal";
  const isFaithful = moment.message_mode === "faithful";

  return `<turn_policy>
🎯 ESTRATÉGIA DESTE TURNO — REGRAS DURAS, NÃO OPCIONAIS

Você está no moment \`${moment.moment_key}\` (${moment.moment_label}), **Bloco ${activeIdx + 1} de ${parts.length}**.

═══ TEXTO-BASE DO BLOCO ATIVO ═══
${parts[activeIdx]}
═══ FIM DO TEXTO-BASE ═══

⛔ REGRA #1 — UM BLOCO POR TURNO (INVIOLÁVEL):
- O array \`messages\` DEVE conter **exatamente 1 elemento** neste turno.
- Esse 1 elemento cobre **APENAS o Bloco ${activeIdx + 1}**. Não pode conter conteúdo dos Blocos ${activeIdx + 2 <= parts.length ? activeIdx + 2 : "—"}${parts.length > activeIdx + 2 ? `, ${activeIdx + 3}` : ""}${parts.length > activeIdx + 3 ? ", …" : ""}.
- Se você sentir vontade de "completar a apresentação" ou "avançar a conversa", PARE. O router vai chamar você de novo no próximo turno e enviar o Bloco ${activeIdx + 2 <= parts.length ? activeIdx + 2 : "(próximo do flow)"} naturalmente.

⛔ REGRA #2 — REAGIR AO LEAD SEM ANTECIPAR:
- Pode adicionar uma frase curta de reação à última mensagem do lead (ex: "Tudo bem também, Vitor.") **DENTRO da mesma mensagem** que cobre o Bloco ${activeIdx + 1}.
- NÃO crie um array \`messages\` com 2 elementos (um pra reação + outro pro bloco). Funde tudo numa mensagem só.

⛔ REGRA #3 — NÃO TRUNCAR O BLOCO:
${isLiteral
  ? `- Modo LITERAL: copie o texto-base **palavra por palavra**. Se o bloco contém múltiplas perguntas (ex: "X? E Y?"), envie TODAS — nunca corte a segunda. Admin curou cada caractere.`
  : isFaithful
  ? `- Modo FAITHFUL: até 10% das palavras podem trocar pra fluir, mas estrutura, ordem e número de perguntas ficam idênticos ao texto-base.`
  : `- Modo FREE: capture a essência. Se o texto-base tem múltiplas perguntas, mantenha todas mesmo adaptando.`}
${moment.literal_phrases && moment.literal_phrases.length > 0
  ? `- Atenção: as literal_phrases do moment (frases obrigatórias) DEVEM aparecer integralmente. Não omita nenhuma.`
  : ""}

✅ APÓS O TURNO:
- Marque \`current_moment_key\` = "${moment.moment_key}".
${isLast
  ? `- Este é o ÚLTIMO bloco. Próximo turno será de outro moment do flow.`
  : `- Router avança automaticamente para o Bloco ${activeIdx + 2} no próximo turno.`}

🔀 EXCEÇÃO (mudança de moment):
- Se o lead trouxe objeção, pergunta nova, ou mudou de assunto totalmente, você PODE escolher outro \`current_moment_key\` (ex: \`objecao_preco\`). Aí o router reseta a contagem. Mas SE você continuar em \`${moment.moment_key}\`, então as Regras #1, #2 e #3 acima são obrigatórias.
</turn_policy>`;
}

function renderTools(tools: string[]): string {
  if (tools.length === 0) return "";

  const TOOL_DESCRIPTIONS: Record<string, string> = {
    calculate_qualification_score:
      "Aplica fórmulas determinísticas de scoring. Args: { fields: { destino, valor_total, num_convidados, ...} }. Retorna { score, breakdown, qualificado }. Use ao fim da sondagem.",
    search_knowledge_base:
      "Busca na base de conhecimento (FAQ, destinos, processo Welcome). Args: { query: string }. Retorna { results: [...] }. Use quando lead pergunta algo factual.",
    check_calendar:
      "Verifica horários DISPONÍVEIS na agenda real da Wedding Planner. Use quando o lead pedir uma data ou horário diferente dos que estão em <proposed_slots> (ex: 'tem dia 17?', 'consegue antes de quinta?', 'manhã do dia 20?', 'na semana que vem?'). Args (todos OPCIONAIS): { data_inicio: 'DD/MM' ou 'DD/MM/YYYY' (default = amanhã), data_fim: idem (default = data_inicio + janela configurada), quantidade: int 1-15 (default 6) }. Retorna { slots_disponiveis: [{date, time, weekday}], note?: string }. Se `slots_disponiveis` vier vazio, leia `note` pra entender o motivo (final de semana, range fora da janela, tudo ocupado) e explique honestamente ao lead. NUNCA invente horários — sempre chame esta tool antes de oferecer outra data.",
    confirm_meeting_slot:
      "[OBRIGATÓRIA NO DESFECHO] CRIA a reunião na agenda real da Wedding Planner. SEMPRE chame esta tool (NÃO chame `create_task` pra isso!) quando o casal escolher/aceitar um dos 3 horários oferecidos em <proposed_slots>. Args: { date: 'DD/MM/YYYY', time: 'HH:MM' } — use EXATAMENTE a data e hora que o casal escolheu. Retorna { reuniao_id, status }. Se retornar erro de conflito, peça pro casal escolher outro horário entre os disponíveis. Esta é a ÚNICA forma de a reunião realmente entrar na agenda da Wedding Planner.",
    request_handoff:
      "Pede transferência pra humano (handoff_actions roda automaticamente). Args: { motivo: string }. Use em loop_incompreensao, alta_intencao_bloqueada, pedido_humano explícito.",
    update_contact:
      "Atualiza dados do contato. Args: { contato_id, nome?, email?, data_nascimento? }. NUNCA atualize telefone.",
    assign_tag:
      "Aplica tag no card. Args: { card_id, tag_name, color? }. Use em sinais indiretos, momentos especiais, desfechos.",
    create_task:
      "Cria TAREFA genérica do CRM (lembrete interno, follow-up administrativo). Args: { titulo, descricao, data_inicio, assignee_id, tipo }. NÃO use pra reunião com a Wedding Planner — pra isso use `confirm_meeting_slot`.",
  };

  return `<tools_available>
Tools que você pode chamar (no campo \`tool_calls\` do output JSON):

${tools.map((t) => `- **${t}**: ${TOOL_DESCRIPTIONS[t] || "(sem descrição)"}`).join("\n")}

## Quando NÃO chamar tool
- Em mensagem trivial (cumprimento, reconhecimento curto)
- Se você já tem a informação no \`<conversation_state>\` ou \`<silent_signals>\`
- Se a tool não é necessária pra responder
</tools_available>`;
}

function renderSchemaReminder(): string {
  return `<output_format>
Retorne JSON ESTRITO conforme schema:

\`\`\`json
{
  "messages": [{ "type": "text", "content": "..." }],
  "card_patch": { /* campos a atualizar no card, ou {} */ },
  "contact_patch": { /* nome, email, data_nascimento, ou {} */ },
  "current_moment_key": "abertura | sondagem | objecao_preco | ... | null",
  "tool_calls": [{ "tool_name": "...", "args": {...} }],
  "internal_reasoning": "Por que escolhi esse momento, quais sinais observei..."
}
\`\`\`

REGRAS:
- \`messages\`: 1-3 mensagens, cada uma <1024 chars, sem travessões.
- \`card_patch\`: SEMPRE inclua os campos do CRM que o lead acabou de revelar nesta rodada (chaves \`ww_*\`, \`crm_field_key\` dos slots de descoberta). Ex: se o lead disse "Argentina" pra pergunta de viagem internacional, inclua \`{"ww_sdr_perfil_viagem_internacional": "Argentina"}\` (ou \`true\` se aceitável boolean). Se o lead disse "não temos ajuda da família", inclua \`{"ww_sdr_ajuda_familia": false}\`. Esquecer de salvar quebra a qualificação determinística do router.
- \`contact_patch\`: vazio ({}) se nada mudar; só nome, email, data_nascimento.
- \`current_moment_key\`: slug do momento detectado, ou null.
- \`tool_calls\`: vazio ([]) na maioria dos turnos.
- \`internal_reasoning\`: 1-3 frases pra log/auditoria. Não vai pro WhatsApp.
</output_format>`;
}
