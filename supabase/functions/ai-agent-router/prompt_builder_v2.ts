/**
 * prompt_builder_v2.ts — Monta o prompt XML-tagged que vai pro LLM no Playbook v2.
 *
 * Parte do Marco 2b do Playbook Conversacional v2.
 *
 * Consumido por persona_v2.ts e também exposto pra preview em tempo real
 * via ai-agent-simulate (preview_playbook_config). O espelho frontend está
 * em src/lib/playbook/buildPromptPreview.ts — teste de paridade em CI.
 *
 * Estrutura do prompt:
 *   <agent name="...">
 *     <header: quem é + missão + descrição da empresa>
 *     <voice>
 *     <anchors>
 *     <boundaries>
 *     <qualification>
 *     <silent_signals>
 *     <examples>
 *   </agent>
 *
 *   <turn>
 *     <detected>  ← momento atual + método + primeiro_contato
 *     <qualification_status>  ← score atual + gaps
 *     <known>   ← ctx.contact_name, ai_resumo, ai_contexto, form_data
 *     <history> ← ctx.historico_compacto
 *     <last_message from="lead">  ← userMessage
 *   </turn>
 *
 *   Instruções finais (produza a resposta agora).
 */

import type {
  PlaybookMoment,
  PlaybookSilentSignal,
  PlaybookFewShotExample,
  IdentityConfig,
  VoiceConfig,
  BoundariesConfig,
  ScoringRule,
} from "./playbook_loader.ts";

// Catálogo de linhas vermelhas padrão (espelho do frontend — NUNCA mude aqui
// sem espelhar em src/lib/playbook/boundariesLibrary.ts, senão quebra paridade).
const BOUNDARIES_LIBRARY: Record<string, string> = {
  never_price: "Nunca falar preço, faixa, 'a partir de' ou valor de mercado",
  never_transfer_explicit: "Nunca dizer 'vou passar', 'vou transferir' ou 'outra pessoa vai te atender'",
  never_ai_mention: "Nunca citar IA, prompt, sistema, formulário, regras internas",
  never_invent: "Nunca inventar prêmio, prazo, feature, dado ou benefício",
  never_blame_customer: "Nunca culpar o cliente pelo problema",
  never_cliche: "Nunca usar clichês: 'casamento dos sonhos', 'experiência premium', 'deixe conosco'",
  never_emoji_first: "Nunca usar emoji na primeira mensagem (depois máximo 1 natural)",
  never_stack_questions: "Nunca empilhar 2+ perguntas soltas sobre temas diferentes na mesma mensagem",
  never_dash_separator: "Nunca usar travessão como separador (use vírgula, ponto, reticências)",
  never_justify_question: "Nunca justificar pergunta ('pra te ajudar melhor...')",
  never_promise_deadline: "Nunca prometer prazo exato sem validar",
  never_mention_competitor: "Nunca mencionar concorrente diretamente",
  never_negotiate_writing: "Nunca negociar preço ou desconto por escrito",
  never_repeat_info: "Se o lead já mencionou algo (nome, prêmio, viagem anterior, dado da família, etc), NÃO conte de novo como novidade. Apenas dê continuidade ('legal!' / 'que bom') ou pule esse trecho do texto âncora se aplicável",
  never_repeat_words: "Mensagens seguidas devem variar palavras e expressões. Não começa duas com 'Que ótimo!', não usa a mesma palavra de impacto em mensagens consecutivas, não repete estruturas",
  never_ask_known_data: "Se já consta nos dados do card (form_data, ai_resumo, ai_contexto), NÃO pergunte de novo. Use o que está registrado. Pergunte só o que ainda não foi coletado",
};

// ---------------------------------------------------------------------------
// Types (in/out)
// ---------------------------------------------------------------------------

export interface BuildPromptV2Input {
  agentName: string;
  companyName: string;
  identity: IdentityConfig | null;
  voice: VoiceConfig | null;
  boundaries: BoundariesConfig | null;
  moments: PlaybookMoment[];
  currentMoment: PlaybookMoment;
  currentMomentMethod: 'deterministic' | 'llm' | 'fallback' | 'manual';
  silentSignals: PlaybookSilentSignal[];
  fewShotExamples: PlaybookFewShotExample[];
  scoringRules: ScoringRule[];
  scoreInfo: {
    enabled: boolean;
    score: number | null;
    threshold: number | null;
    qualificado: boolean | null;
    disqualified?: boolean;
    breakdown?: Array<Record<string, unknown>>;
    missingFields?: string[];
  };
  ctx: {
    is_primeiro_contato: boolean;
    contact_name: string;
    contact_name_known: boolean;
    contact_role: string;
    card_id: string | null;
    card_titulo: string | null;
    pipeline_stage_id: string | null;
    ai_resumo: string;
    ai_contexto: string;
    form_data: Record<string, string>;
    qualificationSignals: Record<string, string>;
    historico_compacto: string;
    last_moment_key: string | null;
    /**
     * Índice do step atual quando o anchor_text do moment está dividido em
     * passos sequenciais via "---" (modo wait_for_reply). 0 = primeiro step.
     * Calculado pelo persona_v2 contando assistant turns no current_moment_key.
     */
    current_moment_step_index?: number;
  };
  userMessage: string;
  companyDescription?: string | null;
  /**
   * Configuração de agendamento automático com closer (handoff_actions.book_meeting).
   * Quando enabled=true, renderiza bloco <meeting_booking> instruindo o LLM a
   * chamar a tool create_task assim que o lead aceitar um horário.
   */
  bookMeeting?: {
    enabled: boolean;
    responsavel_name: string | null;
    tipo: 'reuniao' | 'reuniao_video' | 'reuniao_presencial' | 'reuniao_telefone';
    duracao_minutos: number;
    titulo_template: string;
    mensagem_confirmacao_template: string;
    /** Slots pré-buscados pra LLM propor sem precisar chamar check_calendar primeiro. */
    available_slots?: Array<{ date: string; time: string; weekday: string }>;
  } | null;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPromptV2(input: BuildPromptV2Input): string {
  const subs = buildSubstitutions(input);
  const header = renderHeader(input);
  const voice = renderVoiceBlock(input.voice);
  const anchors = renderAnchorsBlock(input.moments, input.currentMoment, subs, input.ctx.current_moment_step_index);
  const boundaries = renderBoundariesBlock(input.boundaries);
  const qualification = renderQualificationBlock(input.scoringRules, input.scoreInfo);
  const signals = renderSilentSignalsBlock(input.silentSignals);
  const handoffLogic = renderHandoffLogicBlock(input);
  const meetingBooking = renderMeetingBookingBlock(input);
  const examples = renderExamplesBlock(input.fewShotExamples, input.currentMoment);

  const turn = renderTurnBlock(input);

  const instructions = renderClosingInstructions(input);

  const parts = [
    `<agent name="${escapeXml(input.agentName)}">`,
    header,
    voice,
    anchors,
    boundaries,
    qualification,
    signals,
    handoffLogic,
    meetingBooking,
    examples,
    `</agent>`,
    ``,
    turn,
    ``,
    instructions,
  ].filter(p => p !== '');

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderHeader(input: BuildPromptV2Input): string {
  const id = input.identity ?? {};
  const role = id.role === 'custom' && id.role_custom ? id.role_custom : (id.role ?? 'assistente');
  const mission = (id.mission_one_liner ?? '').trim();
  const companyDesc = (id.company_description_override ?? input.companyDescription ?? '').trim();

  const lines = [
    `Você é ${input.agentName}, ${role} da ${input.companyName}.${mission ? ' ' + mission : ''}`,
  ];
  if (companyDesc) lines.push(companyDesc);
  return lines.join('\n\n');
}

function renderVoiceBlock(voice: VoiceConfig | null): string {
  if (!voice) return '';
  const lines: string[] = [];

  const toneTags = voice.tone_tags ?? [];
  const formality = voice.formality ?? 3;
  const emojiPolicy = voice.emoji_policy ?? 'after_rapport';

  const toneLine = toneTags.length > 0
    ? `Tom: ${toneTags.join(', ')}. Formalidade ${formality}/5. Emoji: ${emojiPolicy === 'never' ? 'nunca' : emojiPolicy === 'anytime' ? 'à vontade' : 'só depois de rapport'}.`
    : `Formalidade ${formality}/5. Emoji: ${emojiPolicy === 'never' ? 'nunca' : emojiPolicy === 'anytime' ? 'à vontade' : 'só depois de rapport'}.`;
  lines.push(toneLine);

  const r = voice.regionalisms ?? {};
  const regs: string[] = [];
  if (r.uses_a_gente) regs.push('"A gente" (nunca "nós").');
  if (r.uses_voces_casal) regs.push('"Vocês" pro casal (nunca separar em "você e seu parceiro").');
  if (r.uses_gerundio) regs.push('Gerúndio natural ("tô vendo").');
  if (r.casual_tu_mano) regs.push('Tratamento casual com "cara/mano" quando o lead usar primeiro.');
  if (regs.length > 0) lines.push(regs.join(' '));

  const typical = voice.typical_phrases ?? [];
  if (typical.length > 0) {
    lines.push('Soa assim:');
    typical.forEach(p => lines.push(`  ✓ "${p}"`));
  }

  const forbidden = voice.forbidden_phrases ?? [];
  if (forbidden.length > 0) {
    lines.push('Não soa assim:');
    forbidden.forEach(p => lines.push(`  ✗ "${p}"`));
  }

  if (lines.length === 0) return '';
  return `<voice>\n${lines.join('\n')}\n</voice>`;
}

// Mapa pra normalizar weekday do Postgres → PT-BR. agent_check_calendar usa
// to_char(d, 'Dy') que devolve abrev em inglês quando o locale do server não
// é PT — então mapeamos manualmente aqui pra ter consistência no prompt.
const WEEKDAY_PT: Record<string, string> = {
  Mon: 'segunda', Tue: 'terça', Wed: 'quarta', Thu: 'quinta',
  Fri: 'sexta', Sat: 'sábado', Sun: 'domingo',
  // PT-BR já vem assim em alguns servidores
  Seg: 'segunda', Ter: 'terça', Qua: 'quarta', Qui: 'quinta', Sex: 'sexta', Sáb: 'sábado', Dom: 'domingo',
};

/** Formata um slot do agent_check_calendar pra texto natural: "quarta 30/04 às 14h". */
function formatSlotLabel(slot: { date: string; time: string; weekday: string }): string {
  const wd = WEEKDAY_PT[slot.weekday] ?? slot.weekday.toLowerCase();
  const [, mm, dd] = slot.date.split('-');
  // "14:00" → "14h", "14:30" → "14:30"
  const t = slot.time.endsWith(':00') ? `${slot.time.slice(0, -3)}h` : slot.time;
  return `${wd} ${dd}/${mm} às ${t}`;
}

/**
 * Substitui variáveis dinâmicas em texto livre (anchor_text dos momentos).
 * Variáveis suportadas:
 *   {contact_name}        — nome do lead (ou string vazia + cleanup quando desconhecido)
 *   {agent_name}          — nome do agente
 *   {company_name}        — nome da empresa
 *   {responsavel_name}    — nome do closer (book_meeting.responsavel_name)
 *   {slot_1}/{2}/{3}      — primeiros 3 horários disponíveis formatados
 *   {slots_disponiveis}   — lista natural ("quarta 30/04 às 14h, quinta 01/05 às 10h ou 16h")
 *
 * Quando book_meeting não está ativo, as variáveis de slot/responsável caem em
 * placeholder neutro pra LLM saber que precisa improvisar (ex: "(horários a confirmar)").
 *
 * Nome desconhecido: {contact_name} vira "" (vazio) e applySubstitutions roda
 * cleanup de pontuação solta — "Olá {contact_name}, tudo bem?" vira "Olá, tudo
 * bem?" sem o "(nome do lead)" feio na mensagem real.
 */
function buildSubstitutions(input: BuildPromptV2Input): Record<string, string> {
  const subs: Record<string, string> = {
    '{contact_name}': input.ctx.contact_name_known ? input.ctx.contact_name : '',
    '{agent_name}': input.agentName,
    '{company_name}': input.companyName,
  };

  const cfg = input.bookMeeting;
  subs['{responsavel_name}'] = cfg?.responsavel_name ?? '(especialista)';

  const slots = cfg?.available_slots ?? [];
  const formatted = slots.map(formatSlotLabel);
  subs['{slot_1}'] = formatted[0] ?? '(horário a confirmar)';
  subs['{slot_2}'] = formatted[1] ?? '(horário a confirmar)';
  subs['{slot_3}'] = formatted[2] ?? '(horário a confirmar)';

  // Lista natural com 3 horários: "quarta 30/04 às 14h, quinta 01/05 às 10h ou 16h"
  const top3 = formatted.slice(0, 3);
  if (top3.length === 0) {
    subs['{slots_disponiveis}'] = '(horários a confirmar)';
  } else if (top3.length === 1) {
    subs['{slots_disponiveis}'] = top3[0];
  } else if (top3.length === 2) {
    subs['{slots_disponiveis}'] = `${top3[0]} ou ${top3[1]}`;
  } else {
    subs['{slots_disponiveis}'] = `${top3[0]}, ${top3[1]} ou ${top3[2]}`;
  }

  return subs;
}

function applySubstitutions(text: string, subs: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(subs)) {
    out = out.split(token).join(value);
  }

  // Cleanup quando alguma variável virou string vazia (típico: {contact_name}
  // sem nome conhecido). Sem isso, "Olá {contact_name}, tudo bem?" vira
  // "Olá , tudo bem?" — vergonhoso. Aqui consertamos os artefatos comuns.
  out = out
    // Espaço antes de pontuação ("Olá , X" → "Olá, X")
    .replace(/\s+([,.!?;:])/g, '$1')
    // Vírgula seguida de outra pontuação (",." → ".")
    .replace(/,\s*([.!?])/g, '$1')
    // Pontuação dupla ("Olá,, tudo" → "Olá, tudo")
    .replace(/([,.!?;:])\1+/g, '$1')
    // Espaços múltiplos
    .replace(/[ \t]{2,}/g, ' ')
    // Espaço no início de linha
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  return out;
}

/** Splita anchor_text por separadores "---" (3+ traços em linha própria, c/ ou s/ espaços). */
function splitAnchorSteps(anchor: string): string[] {
  return anchor.split(/\n\s*-{3,}\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
}

function renderOneMoment(
  m: PlaybookMoment,
  currentMomentKey: string,
  subs: Record<string, string>,
  stepIndex?: number,
): string[] {
  const lines: string[] = [];
  const marker = m.moment_key === currentMomentKey ? '★' : '•';
  lines.push(`${marker} ${m.moment_key} — ${m.moment_label}`);

  // Step sequencial: quando momento usa wait_for_reply E anchor está dividido
  // em N steps com "---", mostra só o step ATUAL pra LLM (não toda a seq).
  // Pra outros momentos (ou quando não é o atual), mostra texto inteiro como
  // referência, mas marca claramente que vê só.
  const isCurrent = m.moment_key === currentMomentKey;
  const usesSteps = m.delivery_mode === 'wait_for_reply'
    && typeof m.anchor_text === 'string'
    && /\n\s*-{3,}\s*\n/.test(m.anchor_text);

  if (m.anchor_text && m.anchor_text.trim()) {
    if (isCurrent && usesSteps) {
      const steps = splitAnchorSteps(m.anchor_text);
      const idx = Math.min(stepIndex ?? 0, steps.length - 1);
      const isLast = idx >= steps.length - 1;
      const substituted = applySubstitutions(steps[idx], subs);
      const indentedText = substituted.split('\n').map(l => `    ${l}`).join('\n');
      lines.push(`    [Sequência: passo ${idx + 1} de ${steps.length}${isLast ? ' — último' : ''}]`);
      lines.push(indentedText);
      if (!isLast) {
        lines.push(`    [APÓS o lead responder esta mensagem, no próximo turno mande o passo ${idx + 2}/${steps.length}.]`);
      } else {
        lines.push(`    [Esse é o último passo desta abertura. No próximo turno, AVANCE para a próxima fase do funil.]`);
      }
    } else {
      const substituted = applySubstitutions(m.anchor_text.trim(), subs);
      const indentedText = substituted.split('\n').map(l => `    ${l}`).join('\n');
      lines.push(indentedText);
    }
  }

  if (m.message_mode === 'literal') {
    lines.push(
      '    [modo: TEXTO LITERAL — envie EXATAMENTE como escrito acima, palavra por palavra. ' +
      'As variáveis ({contact_name}, {responsavel_name}, etc) já foram substituídas. ' +
      'NÃO reformule frases. NÃO troque sinônimos. NÃO acrescente saudações extras. NÃO mude o tom. ' +
      'EXCEÇÃO ÚNICA — omissão por redundância: se o lead JÁ mencionou explicitamente um fato específico ' +
      'que está no texto (ex: o lead já disse o nome dele, ou já citou os 5 prêmios, ou já contou a viagem ' +
      'anterior), você pode OMITIR o trecho específico do texto que repete esse fato. Resto continua literal. ' +
      'Quando houver dúvida se omitir ou não, MANTENHA o trecho — só omita quando o lead ' +
      'foi totalmente explícito sobre o assunto. Se uma variável veio vazia (ex: nome desconhecido), ' +
      'pule a parte que dependeria dela de forma natural mas mantenha o resto literal.]'
    );
  } else if (m.message_mode === 'faithful') {
    lines.push(
      '    [modo: DIRETRIZ FIEL — use o texto acima como BASE OBRIGATÓRIA. ' +
      'Mantenha: ordem das ideias, tom, comprimento, estrutura de parágrafos, perguntas no mesmo lugar. ' +
      'Régua quantitativa: mude NO MÁXIMO ~10% das palavras do texto original. Se o anchor tem 100 palavras, ' +
      'você pode trocar até 10. Resto fica como gravado. ' +
      'Adapte SOMENTE: (a) substituir nome do lead; (b) ajustar concordância de gênero/plural quando aplicável; ' +
      '(c) corrigir uma ou outra palavra pra fluir naturalmente. ' +
      'NÃO reescreva frases. NÃO substitua trechos por sinônimos. NÃO mude o tom. NÃO acrescente nem omita ideias. ' +
      'Se o lead já mencionou algo do texto (nome, fato, prêmio), você pode pular naturalmente esse trecho ' +
      'específico — mas mantenha o resto fiel.]'
    );
  } else {
    lines.push('    [modo: livre — você tem flexibilidade total. O texto acima é objetivo, não roteiro. Respeite voice, boundaries e red_lines.]');
  }

  if (m.discovery_config && m.discovery_config.slots && m.discovery_config.slots.length > 0) {
    lines.push('    Informações que você precisa coletar nesta fase:');
    for (const slot of m.discovery_config.slots) {
      const reqMark = slot.required ? ' [obrigatória]' : '';
      const ico = slot.icon ? `${slot.icon} ` : '';
      lines.push(`      - ${ico}${slot.label}${reqMark}`);
      if (slot.questions && slot.questions.length > 0) {
        lines.push(`        Perguntas sugeridas (use uma destas, na ordem que fizer sentido):`);
        slot.questions.forEach(q => lines.push(`          • "${q.trim()}"`));
      } else {
        lines.push(`        Sem pergunta escrita — formule a pergunta natural baseada no contexto.`);
      }
      if (slot.crm_field_key) {
        lines.push(`        (registra em ${slot.crm_field_key})`);
      }
    }
  }

  if (m.red_lines && m.red_lines.length > 0) {
    lines.push('    Não fazer nesta fase:');
    m.red_lines.forEach(rl => lines.push(`      - ${rl}`));
  }
  return lines;
}

function renderAnchorsBlock(
  moments: PlaybookMoment[],
  currentMoment: PlaybookMoment,
  subs: Record<string, string>,
  stepIndex?: number,
): string {
  if (moments.length === 0) return '';

  // Separa fases do funil (kind=flow) das jogadas situacionais (kind=play).
  // Padrão de prompt: o LLM lê melhor duas listas pequenas com semântica clara
  // do que uma lista flat misturando dois conceitos diferentes.
  const flows = moments.filter(m => (m.kind ?? 'flow') === 'flow');
  const plays = moments.filter(m => m.kind === 'play');

  const lines: string[] = [];
  lines.push('Como você conduz a conversa. Sempre adapte ao nome e ao contexto, mantendo estrutura.');
  lines.push('');

  if (flows.length > 0) {
    lines.push('<flow>');
    lines.push('Fases do funil (passe por elas em ordem; cada uma tem um gatilho que indica quando começa):');
    lines.push('');
    for (const m of flows) {
      lines.push(...renderOneMoment(m, currentMoment.moment_key, subs, stepIndex));
      lines.push('');
    }
    lines.push('</flow>');
    lines.push('');
  }

  if (plays.length > 0) {
    lines.push('<plays>');
    lines.push('Jogadas situacionais (podem disparar em qualquer fase quando o gatilho aparece; depois volte pra fase atual):');
    lines.push('');
    for (const m of plays) {
      lines.push(...renderOneMoment(m, currentMoment.moment_key, subs, stepIndex));
      lines.push('');
    }
    lines.push('</plays>');
  }

  return `<anchors>\n${lines.join('\n').trimEnd()}\n</anchors>`;
}

function renderBoundariesBlock(boundaries: BoundariesConfig | null): string {
  if (!boundaries) return '';

  const sections: string[] = [];

  // 1. Biblioteca ativa — agrupada como "Globais"
  const libraryRules: string[] = [];
  if (boundaries.library_active) {
    for (const id of boundaries.library_active) {
      if (BOUNDARIES_LIBRARY[id]) libraryRules.push(BOUNDARIES_LIBRARY[id]);
    }
  }
  if (libraryRules.length > 0) {
    sections.push(`Globais:\n${libraryRules.map(r => `- ${r}`).join('\n')}`);
  }

  // 2. Personalizadas por categoria (novo formato)
  if (boundaries.custom_by_category) {
    for (const [category, items] of Object.entries(boundaries.custom_by_category)) {
      const clean = (items ?? []).filter(i => i && i.trim());
      if (clean.length > 0) {
        sections.push(`${category}:\n${clean.map(r => `- ${r.trim()}`).join('\n')}`);
      }
    }
  }

  // 3. Legacy: custom como lista plana (se houver e não duplicado)
  if (boundaries.custom && boundaries.custom.length > 0) {
    const clean = boundaries.custom.filter(c => c && c.trim());
    if (clean.length > 0) {
      sections.push(`Personalizado (legacy):\n${clean.map(r => `- ${r.trim()}`).join('\n')}`);
    }
  }

  if (sections.length === 0) return '';
  return `<boundaries>\nLinhas vermelhas (valem sempre):\n\n${sections.join('\n\n')}\n</boundaries>`;
}

function renderQualificationBlock(
  rules: ScoringRule[],
  scoreInfo: BuildPromptV2Input['scoreInfo'],
): string {
  if (!scoreInfo.enabled || rules.length === 0) return '';

  const qualify = rules.filter(r => r.rule_type === 'qualify');
  const disqualify = rules.filter(r => r.rule_type === 'disqualify');
  const bonus = rules.filter(r => r.rule_type === 'bonus');

  const lines: string[] = [];

  if (qualify.length > 0) {
    lines.push('Um cliente é qualificado quando combina:');
    for (const r of qualify) {
      lines.push(`  • ${r.label ?? r.dimension} (peso ${r.weight})`);
    }
  }

  if (disqualify.length > 0) {
    lines.push('');
    lines.push('Desqualifica imediatamente (encerrar cordial):');
    for (const r of disqualify) {
      lines.push(`  × ${r.label ?? r.dimension}`);
    }
  }

  if (bonus.length > 0) {
    lines.push('');
    lines.push('Sinais de bônus (somam, mas com cap):');
    for (const r of bonus) {
      lines.push(`  + ${r.label ?? r.dimension} (+${r.weight})`);
    }
  }

  if (scoreInfo.threshold !== null && scoreInfo.threshold !== undefined) {
    lines.push('');
    lines.push(`Score mínimo pra propor próximo passo: ${scoreInfo.threshold}`);
  }

  if (lines.length === 0) return '';
  return `<qualification>\n${lines.join('\n')}\n</qualification>`;
}

/**
 * Bloco de lógica de avanço (qualify → handoff). Só aparece se há scoring
 * habilitado E momento atual é uma fase de coleta (kind=flow com discovery_config)
 * — tipicamente Sondagem.
 *
 * Resolve o problema de "sondagem perpétua": LLM não sabia quando parar de
 * coletar info e passar pro desfecho. Decision tree explícita:
 *   1. Score atinge threshold → desfecho qualificado, pare de perguntar.
 *   2. Slots obrigatórios cheios MAS score abaixo → buscar sinais invisíveis
 *      (família ajudando, viagem internacional, casamento admirado) com
 *      perguntas naturais que possam revelar bonus.
 *   3. Já tentou sinais E score continua abaixo → desfecho não qualificado.
 *   4. Faltam slots obrigatórios → continue sondagem normal.
 */
function renderHandoffLogicBlock(input: BuildPromptV2Input): string {
  const { scoreInfo, currentMoment, silentSignals, ctx } = input;

  // Só faz sentido em fase de coleta (Sondagem)
  const hasDiscovery = currentMoment.discovery_config?.slots && currentMoment.discovery_config.slots.length > 0;
  if (!hasDiscovery || !scoreInfo.enabled) return '';

  const slots = currentMoment.discovery_config!.slots;
  const requiredSlots = slots.filter(s => s.required);

  const requiredFieldsList = requiredSlots
    .map(s => `${s.icon ? s.icon + ' ' : ''}${s.label}${s.crm_field_key ? ` (${s.crm_field_key})` : ''}`)
    .join(', ');

  // Estado dos sinais invisíveis: já revelados (crm_field populado em form_data)
  // vs ainda pendentes. Permite ao LLM saber quais NÃO buscar e quais ainda valem.
  const signalsStatus = silentSignals.map(s => {
    const key = s.crm_field_key;
    const revealed = key && ctx.form_data[key] && String(ctx.form_data[key]).trim();
    return { signal: s, revealed: !!revealed };
  });
  const signalsRemaining = signalsStatus.filter(s => !s.revealed).map(s => s.signal);
  const signalsRevealed = signalsStatus.filter(s => s.revealed).map(s => s.signal);

  const signalsListRemaining = signalsRemaining.map(s => {
    const detect = s.detection_hint ? ` — detectado por: ${s.detection_hint}` : '';
    return `  • ${s.signal_label}${detect}`;
  }).join('\n');

  const lines: string[] = [];
  lines.push('Lógica de avanço — você está em fase de coleta. Decida o próximo passo nesta ordem:');
  lines.push('');
  lines.push('1. SCORE ATINGIU THRESHOLD → AVANCE IMEDIATAMENTE PRO DESFECHO');
  lines.push(`   Olhe <qualification_status> no <turn>. Se score ≥ ${scoreInfo.threshold ?? 25}, sua próxima resposta`);
  lines.push('   ABRE direto com o handoff. Não:');
  lines.push('     - Recapitule o que coletou ("então: nordeste, 80 conv...")');
  lines.push('     - Confirme detalhe extra ("só pra fechar, vocês querem mesmo...")');
  lines.push('     - Faça pergunta secundária ("pé na areia ou clássico?")');
  lines.push('     - Justifique a transição ("já tenho o suficiente")');
  lines.push('   Apenas: reconheça em UMA frase curta + proponha conectar com a especialista.');
  lines.push('   Continuar perguntando depois do score ≥ threshold é o erro mais caro: queima a janela');
  lines.push('   de fechamento e desperdiça atenção do lead premium.');
  lines.push('');
  if (requiredFieldsList) {
    lines.push('2. SLOTS OBRIGATÓRIOS COLETADOS MAS SCORE ABAIXO DO THRESHOLD → BUSQUE SINAIS INVISÍVEIS');
    lines.push(`   Slots obrigatórios desta fase: ${requiredFieldsList}.`);
    lines.push('   Se TODOS estão preenchidos em <known> mas o score ainda está abaixo do mínimo,');
    lines.push('   faça UMA pergunta natural que possa revelar UM dos sinais bonus AINDA NÃO REVELADOS.');
    lines.push('');
    lines.push('   Olhe <signals_status> no <turn> pra saber:');
    lines.push('     - quais sinais já foram revelados (NÃO pergunte de novo, seria invasivo)');
    lines.push('     - quais ainda podem ser buscados');
    if (signalsListRemaining) {
      lines.push('');
      lines.push('   Sinais ainda buscáveis pelo agente (configurados):');
      lines.push(signalsListRemaining);
    }
    lines.push('');
    lines.push('   A pergunta deve soar como conversa genuína (curiosidade sobre estilo de vida, família,');
    lines.push('   inspirações), nunca como "preciso desse dado pra qualificar". UMA pergunta por turno.');
    lines.push('   Se signals_status mostra que já tentou pelo menos 2 turnos seguidos sem revelar nada novo,');
    lines.push('   pare de tentar e vá pro desfecho não qualificado.');
    lines.push('');
  }
  lines.push('3. SCORE CONTINUA ABAIXO MESMO APÓS BUSCAR SINAIS → DESFECHO NÃO QUALIFICADO');
  lines.push('   Encerre cordial e honesto. Não force.');
  lines.push('');
  lines.push('4. FALTAM SLOTS OBRIGATÓRIOS → CONTINUE SONDAGEM NORMAL');
  lines.push('   Faça uma pergunta por turno sobre o slot que ainda falta.');
  lines.push('');
  lines.push('Princípio: seu objetivo é qualificar e conectar com a especialista. Não é entrevista —');
  lines.push('é conversa que decide. Não exponha o jargão (não diga "score", "qualificado", "slots") pro lead.');
  // Anexa o status atual no próprio bloco pra ficar perto da regra
  if (signalsRevealed.length > 0 || signalsRemaining.length > 0) {
    lines.push('');
    lines.push(`<signals_status>`);
    lines.push(`Já revelados (não buscar de novo): ${signalsRevealed.length === 0 ? '(nenhum)' : signalsRevealed.map(s => s.signal_label).join(', ')}`);
    lines.push(`Ainda buscáveis: ${signalsRemaining.length === 0 ? '(nenhum)' : signalsRemaining.map(s => s.signal_label).join(', ')}`);
    lines.push(`</signals_status>`);
  }

  return `<handoff_logic>\n${lines.join('\n')}\n</handoff_logic>`;
}

/**
 * Bloco que ativa o agendamento automático no momento do handoff.
 * Só aparece quando admin configurou handoff_actions.book_meeting.enabled=true
 * E definiu um responsável. O LLM passa a chamar a tool create_task quando o
 * lead concordar com horário, e a tarefa cai pra esse responsável (não SDR).
 */
function renderMeetingBookingBlock(input: BuildPromptV2Input): string {
  const cfg = input.bookMeeting;
  if (!cfg || !cfg.enabled) return '';

  const responsavelLabel = cfg.responsavel_name ?? 'a especialista';
  const slots = cfg.available_slots ?? [];

  const lines: string[] = [];
  lines.push(`Agendamento automático ATIVO. Quando o lead estiver qualificado e pronto pra falar com ${responsavelLabel}, sua missão é fechar dia + horário e registrar a reunião.`);
  lines.push('');

  // ---- Disponibilidade pré-carregada ----
  if (slots.length > 0) {
    lines.push('## Horários disponíveis HOJE na agenda real de ' + responsavelLabel + ' (próximos 14 dias):');
    lines.push('');
    // Agrupa por data pra ficar legível
    const byDay = new Map<string, Array<{ time: string; weekday: string }>>();
    for (const s of slots) {
      const arr = byDay.get(s.date) ?? [];
      arr.push({ time: s.time, weekday: s.weekday });
      byDay.set(s.date, arr);
    }
    for (const [date, times] of byDay) {
      const weekdayPt = times[0]?.weekday ?? '';
      const horas = times.map(t => t.time).slice(0, 4).join(', ');
      // YYYY-MM-DD → DD/MM
      const [, mm, dd] = date.split('-');
      lines.push(`- ${weekdayPt} ${dd}/${mm}: ${horas}`);
    }
    lines.push('');
    lines.push('PROPONHA 2-3 horários (não despeje a lista toda). Misture dias diferentes pra dar opção de variedade. Use formato natural: "tenho quarta 30/04 às 14h ou 16h, e quinta 01/05 às 10h. Qual fica melhor pra vocês?"');
    lines.push('');
  } else {
    lines.push('## Disponibilidade');
    lines.push(`A agenda de ${responsavelLabel} não tem slots pré-carregados. Use a tool **check_calendar** com date_from=hoje e date_to=+14 dias pra ver horários disponíveis ANTES de propor.`);
    lines.push('');
  }

  // ---- Lead propõe horário fora do que você listou ----
  lines.push('## Se o lead propuser outro dia ou horário (fora do que você sugeriu)');
  lines.push('1. Chame **check_calendar** com date_from = data proposta e date_to = mesmo dia (ou janela curta).');
  lines.push('2. Se a resposta `available_slots` contém o horário pedido → confirma direto e vai pro passo de criar a tarefa.');
  lines.push('3. Se NÃO contém → propõe os 2 horários disponíveis mais próximos da preferência do lead. Não rejeite seco; ofereça alternativa.');
  lines.push('4. Loop até fechar um horário que existe na agenda.');
  lines.push('');

  // ---- Quando lead aceita ----
  lines.push('## Quando o lead aceitar um horário');
  lines.push('Chame **create_task** imediatamente, com:');
  lines.push('- tipo: "reuniao"');
  lines.push('- data_vencimento: ISO 8601 (YYYY-MM-DDTHH:MM:SS) — combine a data acordada com o horário aceito');
  lines.push('- titulo: pode mandar curto ("Reunião com lead"). O backend sobrescreve via template configurado.');
  lines.push('- descricao: 1-2 frases com contexto (destino, data do casamento, número de convidados, orçamento). Isso aparece pra ' + responsavelLabel + ' chegar com contexto.');
  lines.push('');
  lines.push(`Tipo configurado pela admin: ${cfg.tipo} (${cfg.duracao_minutos} min). Você não precisa passar isso — o backend aplica.`);
  lines.push('');

  // ---- Mensagem de confirmação ----
  lines.push('## Após create_task retornar success');
  lines.push('Mande UMA mensagem pro lead confirmando, usando este template:');
  lines.push('');
  lines.push(`"${cfg.mensagem_confirmacao_template}"`);
  lines.push('');
  lines.push('Substitua as variáveis com valores reais antes de mandar:');
  lines.push('- {contact_name} → primeiro nome do lead');
  if (cfg.responsavel_name) {
    lines.push(`- {responsavel_name} → "${cfg.responsavel_name}"`);
  }
  lines.push('- {data} → data legível em PT-BR (ex: "quinta-feira, 15 de maio")');
  lines.push('- {hora} → horário em formato HH:MM (ex: "14h" ou "14:30")');
  lines.push('');

  // ---- Regras de ouro ----
  lines.push('## Regras');
  lines.push('- NÃO fale "vou agendar" antes de chamar create_task. Aja, depois confirme.');
  lines.push('- NÃO invente disponibilidade. Use só horários da lista pré-carregada OU retornados por check_calendar.');
  lines.push('- NÃO peça email — o sistema cria a reunião pelo card.');
  lines.push('- Se create_task retornar erro, fale com o lead em linguagem humana ("tive um problema técnico, vou pedir pra alguém te chamar pra ajustar") e dispara handoff.');
  lines.push('- Mantenha o tom natural. Você está marcando uma conversa entre pessoas, não enviando convite de calendário corporativo.');

  return `<meeting_booking>\n${lines.join('\n')}\n</meeting_booking>`;
}

function renderSilentSignalsBlock(signals: PlaybookSilentSignal[]): string {
  if (signals.length === 0) return '';
  const lines: string[] = [];
  lines.push('Sinais a registrar silenciosamente (sem comentar com o lead):');
  for (const s of signals) {
    let line = `• ${s.signal_label} — quando ${s.detection_hint}`;
    if (s.crm_field_key) line += ` → registra em ${s.crm_field_key}`;
    lines.push(line);
    if (s.how_to_use) lines.push(`  uso: ${s.how_to_use}`);
  }
  return `<silent_signals>\n${lines.join('\n')}\n</silent_signals>`;
}

function renderExamplesBlock(examples: PlaybookFewShotExample[], currentMoment: PlaybookMoment): string {
  if (examples.length === 0) return '';

  // Prioriza exemplos do momento atual, mas inclui os gerais também.
  const relevantExamples = examples.slice(0, 8); // cap em 8 pra não explodir tokens
  const lines: string[] = [];

  for (const ex of relevantExamples) {
    const isForCurrent = ex.related_moment_key === currentMoment.moment_key;
    const marker = isForCurrent ? '★' : '';
    lines.push(`${marker}Lead: "${ex.lead_message}"`);
    lines.push(`Agente: "${ex.agent_response}"`);
    if (ex.context_note) lines.push(`(${ex.context_note})`);
    lines.push('');
  }

  return `<examples>\n${lines.join('\n').trimEnd()}\n</examples>`;
}

function renderTurnBlock(input: BuildPromptV2Input): string {
  const ctx = input.ctx;
  const cur = input.currentMoment;
  const scoreInfo = input.scoreInfo;

  const detected = [
    `Momento: ${cur.moment_key} (${cur.moment_label})`,
    `Método: ${input.currentMomentMethod}`,
    `Primeiro contato: ${ctx.is_primeiro_contato ? 'sim' : 'não'}`,
    ...(ctx.last_moment_key ? [`Momento anterior: ${ctx.last_moment_key}`] : []),
  ].join('\n');

  const qualStatus = scoreInfo.enabled && scoreInfo.score !== null
    ? `Score atual: ${scoreInfo.score}${scoreInfo.threshold !== null ? ` / ${scoreInfo.threshold}` : ''}${scoreInfo.disqualified ? ' (desqualificado por hard-stop)' : ''}`
      + (scoreInfo.missingFields && scoreInfo.missingFields.length > 0
        ? `\nFaltam coletar: ${scoreInfo.missingFields.join(', ')}`
        : '')
    : '';

  // Known block
  const knownLines = [
    ctx.contact_name_known ? `Nome: ${ctx.contact_name}` : `Nome: (não sabemos ainda — descubra na conversa)`,
    `Role: ${ctx.contact_role}`,
    ctx.card_id ? `Card: ${ctx.card_titulo ?? '(sem título)'} (etapa: ${ctx.pipeline_stage_id ?? '-'})` : `Card: (ainda não existe)`,
    ctx.ai_resumo ? `Resumo: ${ctx.ai_resumo}` : `Resumo: (vazio — conversa nova)`,
    ctx.ai_contexto ? `Contexto: ${ctx.ai_contexto}` : '',
  ].filter(Boolean);

  const formDataEntries = Object.entries(ctx.form_data).filter(([, v]) => v && String(v).trim());
  if (formDataEntries.length > 0) {
    knownLines.push('');
    knownLines.push('Dados coletados do card:');
    for (const [k, v] of formDataEntries) knownLines.push(`  - ${k}: ${v}`);
  }

  const qualSignalEntries = Object.entries(ctx.qualificationSignals ?? {}).filter(([k, v]) => v && String(v).trim() && !ctx.form_data[k]);
  if (qualSignalEntries.length > 0) {
    knownLines.push('');
    knownLines.push('Sinais inferidos (ainda não persistidos):');
    for (const [k, v] of qualSignalEntries) knownLines.push(`  - ${k}: ${v}`);
  }

  const parts: string[] = [];
  parts.push('<turn>');
  parts.push('<detected>');
  parts.push(detected);
  parts.push('</detected>');
  if (qualStatus) {
    parts.push('');
    parts.push('<qualification_status>');
    parts.push(qualStatus);
    parts.push('</qualification_status>');
  }
  parts.push('');
  parts.push('<known>');
  parts.push(knownLines.join('\n'));
  parts.push('</known>');
  parts.push('');
  parts.push('<history>');
  parts.push(ctx.historico_compacto || '(sem mensagens anteriores)');
  parts.push('</history>');
  parts.push('');
  parts.push('<last_message from="lead">');
  parts.push(input.userMessage);
  parts.push('</last_message>');
  parts.push('</turn>');
  return parts.join('\n');
}

function renderClosingInstructions(input: BuildPromptV2Input): string {
  const cur = input.currentMoment;
  const lines: string[] = [];
  lines.push(`Produza agora a próxima resposta de ${input.agentName}.`);
  lines.push(`- Use a âncora do momento atual (${cur.moment_label}), adaptada ao contexto e ao lead.`);

  // Ritmo de envio configurado pelo admin no MomentCard. wait_for_reply força
  // uma única mensagem curta — ideal pra abertura ("Oi, tudo bem?") onde
  // mandar 3 blocos em rajada parece robô. Default all_at_once preserva
  // comportamento legado (até 3 blocos numa só resposta).
  if (cur.delivery_mode === 'wait_for_reply') {
    lines.push(`- IMPORTANTE: nesta fase, mande APENAS UMA mensagem curta. Não emita múltiplos blocos. Faça uma única pergunta ou afirmação e PARE — espere o lead responder antes de avançar pra próxima coisa. Se o impulso é dizer mais, segura: vai sair menos robótico assim.`);
  } else {
    lines.push(`- Pode quebrar em até 2-3 mensagens curtas se ficar mais natural.`);
  }

  lines.push(`- Respeite voice, boundaries e red_lines deste momento.`);
  lines.push(`- Output: só o texto que vai no WhatsApp. Sem aspas externas, sem prefixo "Resposta:", sem explicação.`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
