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
  };
  userMessage: string;
  companyDescription?: string | null;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildPromptV2(input: BuildPromptV2Input): string {
  const header = renderHeader(input);
  const voice = renderVoiceBlock(input.voice);
  const anchors = renderAnchorsBlock(input.moments, input.currentMoment);
  const boundaries = renderBoundariesBlock(input.boundaries);
  const qualification = renderQualificationBlock(input.scoringRules, input.scoreInfo);
  const signals = renderSilentSignalsBlock(input.silentSignals);
  const handoffLogic = renderHandoffLogicBlock(input);
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

function renderOneMoment(m: PlaybookMoment, currentMomentKey: string): string[] {
  const lines: string[] = [];
  const marker = m.moment_key === currentMomentKey ? '★' : '•';
  lines.push(`${marker} ${m.moment_key} — ${m.moment_label}`);

  if (m.anchor_text && m.anchor_text.trim()) {
    const indentedText = m.anchor_text.trim().split('\n').map(l => `    ${l}`).join('\n');
    lines.push(indentedText);
  }

  if (m.message_mode === 'literal') {
    lines.push('    [modo: texto literal — envie exatamente, só substitua {contact_name}]');
  } else if (m.message_mode === 'faithful') {
    lines.push('    [modo: diretriz fiel — siga estrutura e conteúdo, adapte nome e pequenas palavras]');
  } else {
    lines.push('    [modo: livre — você tem flexibilidade, respeitando objetivo e red_lines]');
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

function renderAnchorsBlock(moments: PlaybookMoment[], currentMoment: PlaybookMoment): string {
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
      lines.push(...renderOneMoment(m, currentMoment.moment_key));
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
      lines.push(...renderOneMoment(m, currentMoment.moment_key));
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
  lines.push(`- Pode quebrar em até 2-3 mensagens curtas se ficar mais natural.`);
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
