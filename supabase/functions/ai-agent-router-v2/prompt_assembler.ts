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
    turn_count: number;
    is_primeiro_contato: boolean;
    contact_name: string | null;
    card_titulo: string | null;
    ai_resumo: string | null;
    ai_contexto: string | null;
    card_form_data: Record<string, unknown> | null;
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
    moments,
    silentSignals,
    fewShotExamples,
    scoringRules,
    scoringThreshold,
    conversationState,
    availableTools,
  } = input;

  const identity = agent.identity_config || {};
  const voice = agent.voice_config || {};
  const boundaries = agent.boundaries_config || {};
  const listening = agent.listening_config || {};

  // -------- Header / identity ---------------------------------------------
  const headerBlock = renderHeader(agent.nome, identity, business);

  // -------- Voice ---------------------------------------------------------
  const voiceBlock = renderVoice(voice);

  // -------- Boundaries ----------------------------------------------------
  const boundariesBlock = renderBoundaries(boundaries);

  // -------- Listening -----------------------------------------------------
  const listeningBlock = renderListening(listening);

  // -------- Playbook (TODOS os momentos) ----------------------------------
  const playbookBlock = renderPlaybook(moments);

  // -------- Silent signals ------------------------------------------------
  const silentSignalsBlock = renderSilentSignals(silentSignals);

  // -------- Qualification (regras como referência) ------------------------
  const qualificationBlock = renderQualification(scoringRules, scoringThreshold);

  // -------- Few-shot examples ---------------------------------------------
  const examplesBlock = renderFewShots(fewShotExamples);

  // -------- Conversation state --------------------------------------------
  const stateBlock = renderConversationState(conversationState);

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

function renderPlaybook(moments: PlaybookMoment[]): string {
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
    if (m.anchor_text) {
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

function renderTools(tools: string[]): string {
  if (tools.length === 0) return "";

  const TOOL_DESCRIPTIONS: Record<string, string> = {
    calculate_qualification_score:
      "Aplica fórmulas determinísticas de scoring. Args: { fields: { destino, valor_total, num_convidados, ...} }. Retorna { score, breakdown, qualificado }. Use ao fim da sondagem.",
    search_knowledge_base:
      "Busca na base de conhecimento (FAQ, destinos, processo Welcome). Args: { query: string }. Retorna { results: [...] }. Use quando lead pergunta algo factual.",
    check_calendar:
      "Verifica agenda da Wedding Planner. Args: { responsavel_id, data_inicio, data_fim }. Retorna { slots_disponiveis: [...] }. Use só em desfecho_qualificado.",
    request_handoff:
      "Pede transferência pra humano (handoff_actions roda automaticamente). Args: { motivo: string }. Use em loop_incompreensao, alta_intencao_bloqueada, pedido_humano explícito.",
    update_contact:
      "Atualiza dados do contato. Args: { contato_id, nome?, email?, data_nascimento? }. NUNCA atualize telefone.",
    assign_tag:
      "Aplica tag no card. Args: { card_id, tag_name, color? }. Use em sinais indiretos, momentos especiais, desfechos.",
    create_task:
      "Cria reunião/tarefa. Args: { titulo, descricao, data_inicio, assignee_id, tipo }. Use em desfecho_qualificado.",
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
- \`card_patch\` / \`contact_patch\`: vazios ({}) se nada mudar.
- \`current_moment_key\`: slug do momento detectado, ou null.
- \`tool_calls\`: vazio ([]) na maioria dos turnos.
- \`internal_reasoning\`: 1-3 frases pra log/auditoria. Não vai pro WhatsApp.
</output_format>`;
}
