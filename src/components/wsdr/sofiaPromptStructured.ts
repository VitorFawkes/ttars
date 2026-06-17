// Montador ESTRUTURADO do prompt da Sofia para a prévia técnica da tela.
//
// FIDELIDADE É O PONTO: este arquivo reproduz, palavra por palavra, o System Prompt
// e o User Prompt REAIS enviados ao modelo (definidos em scripts/create-n8n-sdr-weddings.js,
// SYSTEM_PROMPT linhas 50-184 e USER_TEXT linhas 186-208). Cada `{{ }}` daquele prompt é
// preenchido aqui com a MESMA lógica do nó "Monta" (linhas 240-493 do mesmo script).
//
// Cada segmento é classificado em:
//   • 'fixed'   → esqueleto fixo (a inteligência da Sofia; não vem de configuração)
//   • 'field'   → vem das suas configurações (com `label` dizendo de qual ajuste saiu)
//   • 'runtime' → preenchido na hora da conversa (histórico, nota, horários, etc.)
//
// ⚠️ Se você mudar o prompt no n8n (create-n8n-sdr-weddings.js), atualize este arquivo
// junto — senão a prévia da tela passa a mentir sobre o que é enviado de verdade.

import {
  type SofiaConfigV2,
  buildRegrasFromLegacy,
} from './sofiaConfig'

export type SegKind = 'fixed' | 'field' | 'runtime'
export interface PromptSegment {
  text: string
  kind: SegKind
  /** De qual ajuste da tela este trecho veio (só em 'field'/'runtime'). */
  label?: string
}
export interface SofiaPromptParts {
  system: PromptSegment[]
  user: PromptSegment[]
}

const arr = <T,>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : [])

// Espelha o objeto que o nó "Monta" produz (só os campos usados nos dois prompts).
interface MontaValues {
  persona: string
  funcao: string
  empresa: string
  tom_desc: string
  proposta_txt: string
  missao_txt: string
  objetivo_qualifica_txt: string
  reacao_txt: string
  fases_txt: string
  etapas_txt: string
  gates_convite_txt: string
  invented_date_rule_txt: string
  agenda_regras_txt: string
  faixas_txt: string
  regras_txt: string
  competitors_txt: string
  fronteiras_txt: string
  pricing_txt: string
  precos_destinos_txt: string
  glossary_usar: string
  glossary_evitar: string
  regras_voz_txt: string
  frases_tipicas_txt: string
  momentos_txt: string
  comportamentos_txt: string
  abertura_txt: string
  faqs_txt: string
}

type CriterionKindLocal = 'sim_nao' | 'faixas_valor' | 'peso_por_opcao' | 'desqualifica'
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- espelha o JS solto do nó Monta
type AnyCriterion = any

const kindOf = (c: AnyCriterion): CriterionKindLocal =>
  c.kind || ((c.importancia === 'desqualifica' || c.rule_type === 'disqualifier') ? 'desqualifica' : 'sim_nao')

const DOW_NAMES: Record<number, string> = { 0: 'domingo', 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado' }

// Reproduz o nó "Monta" do n8n a partir do objeto de configuração da Sofia.
function computeMonta(cfg: SofiaConfigV2): MontaValues {
  const id = cfg.identity || ({} as SofiaConfigV2['identity'])
  const vo = cfg.voice || ({} as SofiaConfigV2['voice'])
  const qu = cfg.qualification || ({} as SofiaConfigV2['qualification'])
  const bo = cfg.boundaries || ({} as SofiaConfigV2['boundaries'])
  const pr = cfg.pricing || ({} as SofiaConfigV2['pricing'])
  const caps = cfg.capabilities || ({} as SofiaConfigV2['capabilities'])

  const tomMap: Record<string, string> = {
    acolhedor: 'acolhedor, caloroso e humano',
    formal: 'profissional e formal, sóbrio',
    direto: 'direto e objetivo, sem rodeios',
  }
  const tom = vo.tom || 'acolhedor'
  const fm = typeof vo.formalidade === 'number' ? vo.formalidade : 0.5
  const formalidade_desc = fm < 0.34
    ? 'bem informal e leve, pode usar gírias leves e contrações'
    : fm > 0.66
      ? 'mais formal e sóbrio, sem gírias, ainda caloroso'
      : 'natural, nem formal demais nem casual demais'
  const tone_tags_txt = arr(vo.tone_tags).filter(Boolean).join(', ')
  const tom_desc = (tomMap[tom] || tom || 'acolhedor, caloroso e humano') + ', ' + formalidade_desc + (tone_tags_txt ? ', ' + tone_tags_txt : '')

  const proposta_val = id.proposta || ''
  const proposta_txt = proposta_val
    ? 'Sobre a ' + (id.empresa || 'gente') + ': ' + proposta_val + '. Use isso pra se apresentar com naturalidade, sem decorar.'
    : ''
  const funcao = id.role && String(id.role).trim() ? id.role : 'especialista de casamentos'
  const missao_txt = id.mission_one_liner && String(id.mission_one_liner).trim() ? 'Sua missão: ' + id.mission_one_liner + '.' : ''

  // Preço
  const revealMap: Record<string, string> = {
    always: 'Pode mencionar a assessoria e as faixas por destino proativamente, com leveza.',
    on_question: 'Mencione a assessoria de leve quando fizer sentido; só dê as faixas por destino quando o casal perguntar o valor.',
    on_hesitation: 'Só fale de valor se o casal hesitar ou insistir; senão foque no sonho deles.',
    hand_to_planner: 'Não dê faixas de casamento; fale só da assessoria e remeta o resto à Wedding Planner.',
  }
  const assessoria_txt = pr.mention_fee !== false
    ? 'Assessoria (nosso honorário): de R$ ' + (pr.fee_min_brl || 4000) + ' a R$ ' + (pr.fee_max_brl || 18000) + ', conforme o escopo.'
    : ''
  const ranges_txt = arr(pr.destination_ranges).map(r => {
    const tiers = arr(r.tiers).map(t => t.convidados + ' convidados a partir de ' + (t.a_partir != null ? t.a_partir : '') + ' ' + (r.moeda || '')).join('; ')
    return '- ' + (r.destino || '') + ': ' + tiers + (r.contexto ? ' (' + r.contexto + ')' : '')
  }).join('\n')
  const pushback_txt = pr.tone_on_pushback === 'firm'
    ? 'Se hesitarem pelo valor, reafirme com firmeza o valor e os diferenciais, sem agressividade.'
    : 'Se hesitarem pelo valor, acolha com empatia, reconheça o momento e deixe a porta aberta.'
  const pricing_txt = [
    assessoria_txt,
    revealMap[pr.reveal_strategy] || revealMap.on_question,
    pr.can_negotiate ? '' : 'NUNCA negocie nem dê desconto, você é SDR.',
    pushback_txt,
    ranges_txt ? 'Faixas de casamento por destino (a partir de):\n' + ranges_txt : '',
  ].filter(Boolean).join('\n')
  const precos_destinos_txt = arr(pr.destination_ranges).map(r => r.destino).filter(Boolean).join(', ')

  // Glossário (config guarda string[]; o Monta tolera objeto, mantemos robusto)
  const gword = (g: unknown): string => (typeof g === 'string' ? g : ((g as { palavra?: string })?.palavra || ''))
  const galt = (g: unknown): string => (typeof g === 'string' ? '' : ((g as { alternativa?: string })?.alternativa || ''))
  const gl = vo.glossary || { marca: [], proibida: [] }
  const glossary_usar = arr(gl.marca).map(gword).filter(Boolean).join(', ')
  const glossary_evitar = arr(gl.proibida).map(g => gword(g) + (galt(g) ? ' (prefira "' + galt(g) + '")' : '')).filter(Boolean).join(', ')

  // Regras de conduta (lista unificada; fallback p/ legado curadas+comportamentos)
  const regrasList = arr(bo.regras).filter(r => r && r.texto).length
    ? arr(bo.regras).filter(r => r && r.texto)
    : buildRegrasFromLegacy(bo.curadas || {}, arr(bo.comportamentos))
  const ativas = regrasList.filter(r => r.ativa !== false)
  const regras_txt = ativas.map(r => '- ' + r.texto).join('\n')
  const invented_date_rule_txt = ativas.some(r => r.id === 'no_invented_date') ? 'Você não inventa data nem horário. ' : ''

  const regras_voz_txt = arr(vo.rules).filter(Boolean).map(r => '- ' + r).join('\n')
  const frases = arr(vo.typical_phrases).filter(Boolean)
  const frases_tipicas_txt = frases.length
    ? 'Frases que você costuma usar (use como referência de tom, não copie sempre): ' + frases.map(f => '"' + f + '"').join('; ')
    : ''
  const competitors = arr(bo.competitors_to_avoid).filter(Boolean)
  const competitors_txt = competitors.length ? '- Nunca cite nem recomende concorrentes (' + competitors.join(', ') + ').' : ''
  const fronteiras_txt = arr(bo.custom).map(f => '- ' + f).join('\n')

  // Agenda (só entra quando a capacidade "Marcar reunião" está ligada)
  const cal = caps.calendar || ({} as SofiaConfigV2['capabilities']['calendar'])
  const calWins = arr(cal.windows)
  const calDur = typeof cal.slot_duration_minutes === 'number' ? cal.slot_duration_minutes : 45
  const calLead = typeof cal.min_lead_hours === 'number' ? cal.min_lead_hours : 1
  const calSkipWe = cal.skip_weekends !== false
  const fmtHM = (s: string) => String(s || '').replace(':00', 'h').replace(':', 'h')
  const lastStart = (w: { fim?: string }) => {
    const parts = String((w && w.fim) || '17:00').split(':')
    const endM = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0)
    const lm = endM - calDur
    const h = Math.floor(lm / 60), mm = lm % 60
    return h + 'h' + (mm > 0 ? String(mm).padStart(2, '0') : '')
  }
  const winTxts = calWins.map(w => {
    const dias = arr(w.dias).length ? w.dias : [1, 2, 3, 4, 5]
    return dias.map(d => DOW_NAMES[d]).filter(Boolean).join(', ') + ' das ' + fmtHM(w.inicio || '10:00') + ' às ' + fmtHM(w.fim || '17:00')
  })
  const agenda_regras_txt = (cal.enabled && calWins.length)
    ? 'Regras reais da agenda da Wedding Planner (use SÓ pra explicar quando um horário não der; nunca invente nem prometa fora delas):\n'
      + '- Atende: ' + winTxts.join(' / ') + '.\n'
      + '- Cada conversa dura ' + calDur + ' min, então o horário mais tarde que dá pra começar é ' + lastStart(calWins[0]) + '.\n'
      + '- Precisa de pelo menos ' + calLead + 'h de antecedência' + (calSkipWe ? ' e não atende fins de semana' : '') + '.'
    : ''

  // Momentos
  const momTrig: Record<string, string> = {
    always: 'Em qualquer momento',
    on_price_question: 'Quando o casal perguntar preço ou valor',
    on_price_hesitation: 'Quando o casal hesitar por causa do valor',
    on_family_mentioned: 'Quando o casal mencionar a família (pais, sogros)',
    on_destination_unclear: 'Quando o destino ainda não estiver claro',
    on_destination_off_catalog: 'Quando o casal quiser um destino fora do que a gente opera (ex: Ásia, Bali)',
    on_honeymoon: 'Quando o casal mencionar lua de mel ou viagem pós-casamento',
    on_closing_signal: 'Quando o casal sinalizar fim da conversa (ok, blz, obrigado, depois eu vejo)',
    on_high_qualification: 'Quando o casal já estiver bem qualificado',
    on_low_qualification: 'Quando ainda faltar qualificar o casal',
    on_hesitation_timeout: 'Quando o casal hesitar ou disser que vai pensar',
    custom_condition: '',
  }
  const moments = arr(cfg.moments).filter(m => m && m.enabled !== false && m.instrucao)
  const momentos_txt = moments.map(m => {
    let when = momTrig[m.trigger_type] || ''
    if (m.trigger_type === 'custom_condition' && m.custom_condition_description) when = 'Quando ' + m.custom_condition_description
    const instr = m.instrucao
    return when ? '- ' + when + ': ' + instr : '- ' + instr
  }).join('\n')

  // Fases
  const phases = arr(cfg.phases).filter(p => p && (p.nome || p.objetivo))
  const fases_txt = phases.map((p, i) => (i + 1) + '. ' + (p.nome || '') + ': ' + (p.objetivo || '') + (p.avancar_quando ? ' (avança quando: ' + p.avancar_quando + ')' : '')).join('\n')

  // Critérios → objetivo de qualificação + "o que entender"
  const crit = arr(qu.criteria) as AnyCriterion[]
  const objetivo_qualifica_txt = crit.length
    ? (crit.filter(c => kindOf(c) !== 'desqualifica').map(c => String(c.label || '').split('(')[0].split(' - ')[0].trim().toLowerCase()).filter(Boolean).slice(0, 6).join(', ') || 'o que importa pra qualificar')
    : 'o que importa pra qualificar'
  const reacao_txt = vo.reaction && String(vo.reaction).trim()
    ? String(vo.reaction).trim()
    : 'Reaja ao que o casal disse quando tiver peso de verdade (uma pergunta, um sonho, uma dor): acolhe e segue. Não comente trivialidades (de onde vieram, o canal) nem repita o óbvio.'
  const gates_convite_txt = qu.invite_gates && String(qu.invite_gates).trim()
    ? String(qu.invite_gates).trim()
    : 'Só convide pra Wedding Planner quando TUDO for verdadeiro:\n- Você sabe o nome do casal.\n- O casal está qualificado pelos seus critérios (a leitura de qualificação abaixo diz "qualificado: sim").\n- Há sinal de vontade real de seguir ou data pretendida.\nData definida ou pedido de prioridade é sinal forte pra convidar assim que isso acontecer.'

  const comoPerg = (c: AnyCriterion) => (c.como_perguntar && String(c.como_perguntar).trim())
    ? ' Pergunta preferida: "' + String(c.como_perguntar).trim() + '".'
    : ' (formule a pergunta pelo alvo, com naturalidade.)'
  const fronteiraTag = (c: AnyCriterion) => c.perguntar_quando === 'fronteira'
    ? ' [só na fronteira: pergunte isto apenas se o casal estiver no limite de qualificar, não antes]'
    : ''
  const entender_txt = crit.filter(c => kindOf(c) !== 'desqualifica')
    .map((c, i) => (i + 1) + '. Descubra: ' + (c.label || '') + '.' + comoPerg(c) + fronteiraTag(c)).join('\n')

  // Sondagem (fallback quando não há critérios)
  const slots = arr(qu.discovery_slots).filter(s => s && s.label)
  const prioLabel: Record<string, string> = { critical: 'crítico', preferred: 'importante', nice_to_have: 'extra' }
  const sondagem_txt = slots.map((s, i) => {
    const qs = arr(s.questions).filter(Boolean)
    const qPart = qs.length ? ' Perguntas que você pode fazer: ' + qs.map(q => '"' + q + '"').join(' / ') + '.' : ' (improvise a pergunta com naturalidade.)'
    const cov = s.coverage_notes ? ' Precisão necessária: ' + s.coverage_notes + '.' : ''
    return (i + 1) + '. ' + s.label + ' [' + (prioLabel[s.priority] || 'importante') + '].' + qPart + cov
  }).join('\n')

  const etapas = arr(qu.etapas)
  const sinais = arr(qu.silent_signals).filter(Boolean)
  const sinais_txt = sinais.length ? '\nAlém disso, perceba sozinha, sem perguntar: ' + sinais.join('; ') + '.' : ''
  const etapas_base = crit.length ? entender_txt : (slots.length ? sondagem_txt : etapas.map((e, i) => (i + 1) + '. ' + e).join('\n'))
  const etapas_txt = etapas_base + sinais_txt

  const faixas_txt = arr(qu.faixas_orcamento).join('; ')

  // Abertura
  const subsVars = (str: string) => {
    let t = String(str || '')
    t = t.split('{{contact_name}}').join('o casal')
    t = t.split('{{agent_name}}').join(id.persona_nome || 'Sofia')
    t = t.split('{{company_name}}').join(id.empresa || 'a gente')
    t = t.split('{{date}}').join(new Date().toLocaleDateString('pt-BR'))
    return t
  }
  const abMode = vo.abertura_mode || 'literal'
  const abRaw = vo.abertura || ''
  const steps = arr(vo.opening_steps).filter(s => s && s.fala)
  let abertura_txt: string
  if (vo.opening_stepped && steps.length) {
    const stepLines = steps.map((s, i) => '  ' + (i + 1) + '. ' + s.fala + (s.espera_resposta ? ' [espere a resposta antes do próximo]' : ' [pode emendar no próximo]') + (s.captura ? ' (tente captar: ' + s.captura + ')' : '')).join('\n')
    abertura_txt = 'A abertura acontece em PASSOS, nesta ordem. Faça UM passo por vez; nos passos marcados "espere a resposta", pare e aguarde o casal responder antes de seguir pro próximo. Sempre reaja ao que disseram. Descubra pelo histórico em que passo você está (o que já foi dito/captado) e dê o próximo. Passos:\n' + stepLines
  } else if (abMode === 'free') {
    abertura_txt = 'No primeiro contato, abra como um bom SDR humano. ' + reacao_txt + ' Se apresente com naturalidade usando sua persona e a proposta da empresa. Tudo numa fala curta e calorosa, sem texto decorado.'
  } else if (abMode === 'directive') {
    abertura_txt = 'No primeiro contato, abra como um bom SDR humano faria. ' + reacao_txt + ' E cubra com naturalidade estes pontos, sem copiar literalmente: ' + subsVars(abRaw) + '. Teça tudo numa única fala curta e calorosa.'
  } else {
    abertura_txt = 'Use só no primeiro contato, exatamente assim: ' + subsVars(abRaw)
  }

  // Base de conhecimento (só quando ligada)
  const kb = caps.knowledge || ({} as SofiaConfigV2['capabilities']['knowledge'])
  const faqs = (kb.enabled && Array.isArray(kb.faqs)) ? kb.faqs : []
  const faqs_txt = faqs.map(f => '- P: ' + (f.q || '') + '\n  R: ' + (f.a || '')).join('\n')

  return {
    persona: id.persona_nome || 'Sofia',
    funcao,
    empresa: id.empresa || 'Welcome Weddings',
    tom_desc,
    proposta_txt,
    missao_txt,
    objetivo_qualifica_txt,
    reacao_txt,
    fases_txt,
    etapas_txt,
    gates_convite_txt,
    invented_date_rule_txt,
    agenda_regras_txt,
    faixas_txt,
    regras_txt,
    competitors_txt,
    fronteiras_txt,
    pricing_txt,
    precos_destinos_txt,
    glossary_usar,
    glossary_evitar,
    regras_voz_txt,
    frases_tipicas_txt,
    momentos_txt,
    comportamentos_txt: '',
    abertura_txt,
    faqs_txt,
  }
}

// Monta a lista de segmentos do System Prompt — texto fixo verbatim de SYSTEM_PROMPT,
// com cada {{ }} substituído pelo valor da config e marcado com a sua origem.
function buildSystem(m: MontaValues): PromptSegment[] {
  const S: PromptSegment[] = []
  const fix = (text: string) => S.push({ text, kind: 'fixed' })
  const field = (text: string, label: string) => { if (text) S.push({ text, kind: 'field', label }) }
  const runtime = (text: string, label: string) => S.push({ text, kind: 'runtime', label })

  fix('<papel>\nVocê é ')
  field(m.persona, 'Nome da persona')
  fix(', ')
  field(m.funcao, 'Papel dela')
  fix(' da ')
  field(m.empresa, 'Empresa / marca')
  fix(', conversando por WhatsApp com um casal que chamou a gente depois de ver algo nosso. Seu tom é ')
  field(m.tom_desc, 'Tom de voz, formalidade e temperos')
  fix('. Você é gente de verdade, nunca um robô ou formulário.\n')
  field(m.proposta_txt, 'Descrição da empresa')
  fix('\n')
  field(m.missao_txt, 'Missão em uma frase')
  fix('\n</papel>\n\n<objetivo>\nTer uma conversa boa e humana que faça o casal se sentir entendido, entender o que eles sonham pro casamento, qualificar com leveza (')
  field(m.objetivo_qualifica_txt, 'Critérios de qualificação')
  fix(') e, quando fizer sentido, convidar pra uma conversa com a nossa Wedding Planner. Você acolhe, entende e abre a porta pra Planner. Você não fecha venda nem negocia, mas PODE falar de valor (assessoria e faixas) conforme a política de preço abaixo.\n</objetivo>\n\n<como_voce_conversa>\nEste é o seu JEITO de conversar. Vale pra toda mensagem (não está repetido em outro bloco):\n- Soa como pessoa real no WhatsApp: leve, calorosa, curiosa de verdade. Frases curtas, português natural, contração, "a gente" (nunca "nós"), "vocês". Espelha o jeito e as palavras deles.\n- ')
  field(m.reacao_txt, 'Como ela reage ao que o casal diz')
  fix('\n- Conduz pela curiosidade. Em geral uma pergunta aberta por vez, mas PODE fazer mais de uma quando combinam de verdade (mesmo assunto) e fica natural. Nunca metralha nem soa interrogatório. Às vezes só acolhe, sem perguntar nada.\n- Varia as aberturas e os reconhecimentos, nunca repete a mesma muleta ("que delícia", "que lindo") em mensagens seguidas. Usa o nome com parcimônia.\n- Deixa o casal falar mais que você. Pergunta de "como" e "o que", nunca um "por quê" que soe cobrança.\n</como_voce_conversa>\n\n<fluxo_de_fases>\nAs fases são o seu RUMO macro (objetivos que se cumprem em ordem), não um cronômetro. Dentro de cada fase, conduza pela curiosidade (seu jeito de conversar acima). Nunca anuncie a fase nem diga "estou na fase X".\n')
  field(m.fases_txt || '(sem fases definidas, conduza com bom senso)', 'Roteiro da conversa')
  fix('\nPela conversa até aqui, você está na fase: ')
  runtime('(a primeira)', 'Fase atual — definida durante a conversa')
  fix('.\nCumpra o objetivo da fase atual antes de passar pra próxima. Se a fase pede só se apresentar e esperar, respeite isso. Os momentos abaixo podem interromper quando o casal puxar o assunto.\n</fluxo_de_fases>\n\n<o_que_entender>\nO que você precisa descobrir sobre o casal (a ordem flui conforme a conversa, NÃO é fixa). Cada item traz o alvo e, quando houver, a pergunta que você prefere usar (sempre adaptada ao que eles disseram):\n')
  field(m.etapas_txt, 'Critérios / o que ela descobre + sinais silenciosos')
  fix('\nPuxe naturalmente do que eles já contaram. Itens marcados "só na fronteira" só entram quando o casal estiver no limite de qualificar (faltando ponto), não antes.\n</o_que_entender>\n\n<matriz_de_decisao>\nChecklist silencioso do que FALTA agora (decide o próximo passo; nunca exponha):\n- Falta o nome? Peça de leve.\n- Falta algum alvo de "o que entender"? Puxe ele com naturalidade (a pergunta preferida está lá).\n- Os gates do convite fecharam (veja <gates_do_convite>)? Costure numa frase, com as palavras deles, e convide.\nIsto é só "o que falta agora". O jeito de falar vem de <como_voce_conversa>; quando convidar, dos <gates_do_convite>.\n</matriz_de_decisao>\n\n<spin_framework>\nLente de LINGUAGEM pra escolher o ângulo da fala (NÃO define ordem nem é roteiro; o rumo são as fases, o que falta é a matriz):\n- situação: a realidade do casal (quem são, onde pensam casar, época, tamanho, em que ponto estão).\n- problema: o que pesa (logística, fornecedores à distância, alinhar família, medo de errar). O casal nomeia a dor, você não impõe.\n- implicação: o efeito da dificuldade, com leveza, sem dramatizar.\n- ganho: o valor de ter a Planner ao lado (tranquilidade, curadoria local), pra o convite ser desejado, não empurrado.\nUse a lente que couber; pule o que não fizer sentido. Nunca rotule "situação/problema" na fala.\n</spin_framework>\n\n<gates_do_convite>\n')
  field(m.gates_convite_txt, 'Quando ela convida pra Wedding Planner')
  fix('\n</gates_do_convite>\n\n<convite_e_agenda>\nA reunião é entre o casal e a nossa Wedding Planner. Você NÃO participa da reunião nem é a Planner; você só AGENDA. Quando fizer sentido, convide. PRÉ-REQUISITO: só convide e ofereça horários se a leitura de qualificação disser que o casal está QUALIFICADO. Se ainda não estiver qualificado e o casal pedir pra marcar, acolha o interesse ("amei a vontade de vocês") e faça a pergunta que falta pra qualificar ANTES de oferecer qualquer horário; não marque ainda. ')
  field(m.invented_date_rule_txt, 'Regra "não inventar data" (Pode & não pode)')
  fix('\n')
  field(m.agenda_regras_txt, 'Agenda (capacidade "Marcar reunião")')
  fix('\nReunião JÁ RESERVADA com a Planner: ')
  runtime('(nenhuma ainda)', 'Reunião reservada — vem da agenda na conversa')
  fix('\n- Se já existe reunião reservada, ela é a verdade: quando o assunto voltar, refira-se a ELA (dia e hora), não ofereça horários de novo. Se o casal pedir pra mudar, marque o novo horário (agenda.acao "marcar"; a anterior é remarcada automaticamente pelo sistema).\nComo conduzir o agendamento (seja inteligente, nunca um balcão burro):\n- VOCÊ marca de verdade: quando você decide marcar (agenda.acao = "marcar" na sua saída, veja <formato>), o sistema RESERVA a reunião na agenda real ANTES da sua mensagem ser enviada. Por isso, só afirme "reservado/marcado/agendado" quando estiver marcando NESTA mensagem ou quando a reunião já estiver reservada (linha acima). Se está só propondo, proponha de verdade ("fecho pra vocês?") sem afirmar reserva.\n- O casal FECHOU um horário quando diz "pode ser/ok/fechado/esse mesmo", escolhe um dos horários que você ofereceu, pede pra você marcar, ou manda o e-mail logo depois de você propor um horário concreto. Aí agenda.acao = "marcar" com o iso desse horário, e a resposta já confirma a reserva e pede o e-mail (se ainda não tiver).\n- Pergunta NÃO é aceite: se o casal só pergunta se um horário existe/está livre ("tem 17h30?"), confirme que está livre (se estiver na LISTA COMPLETA) e pergunte se fecham; agenda.acao = "nenhuma".\n- Você tem DUAS listas: SUGESTÕES (poucos horários pra oferecer proativamente) e LISTA COMPLETA (TODOS os horários realmente livres da Planner). A verdade sobre o que está livre é a LISTA COMPLETA.\n- Se o casal pedir um horário ou período específico (ex.: "17h30", "fim da tarde", "segunda à noite"), NUNCA ignore. PRIMEIRO reconheça o que pediram. Um horário está DISPONÍVEL se ele aparece na LISTA COMPLETA — mesmo que não esteja nas SUGESTÕES. Nesse caso, aceite e confirme esse horário; NUNCA diga que está ocupado/indisponível.\n- Só trate um horário como indisponível se ele NÃO aparece na LISTA COMPLETA. Aí sim, diga com gentileza e explique o porquê em uma frase curta (fora do horário de atendimento, dia que a Planner não atende, ou cedo demais pela antecedência) e JÁ ofereça os horários livres MAIS PRÓXIMOS do que eles queriam (ex.: pediram 19h30 e a Planner vai até as 19h: "ela atende até as 19h, mas consigo às 19h ou, se preferir, em outro dia mais cedo"). Nunca só despeje outros horários sem reconhecer o que pediram.\n- Se não pediram horário específico, ofereça ALGUNS horários das SUGESTÕES (poucos por vez, variando manhã/tarde/noite como um humano faria) e peça pra escolherem um.\n- Nunca prometa um horário que não está na LISTA COMPLETA. Se não houver nenhum horário livre carregado, pergunte o melhor período pra você verificar.\nAo marcar, já confirme a reserva e peça o e-mail na mesma mensagem (se ainda não tiver). Handoff invisível: nunca diga "vou te transferir/passar"; fale como quem cuida da reserva ("já deixo reservado com a nossa Planner"), mas SÓ quando estiver de fato marcando.\nSUGESTÕES (ofereça proativamente destas, poucas por vez):\n')
  runtime('(nenhum horário carregado; pergunte o melhor período)', 'Horários sugeridos — calculados na conversa')
  fix('\nLISTA COMPLETA de horários realmente livres (use pra validar/confirmar QUALQUER horário que o casal pedir; se está aqui, está livre):\n')
  runtime('(nenhum horário carregado; pergunte o melhor período)', 'Horários livres — calculados na conversa')
  fix('\n</convite_e_agenda>\n\n<linhas_vermelhas>\nRegras absolutas, nunca quebre:\n- ORÇAMENTO DO CASAL: se for descobrir o orçamento e o casal recusar um número, ofereça estas faixas como opção e siga sem travar: ')
  field(m.faixas_txt, 'Orçamento do casal (faixas)')
  fix(' (é o orçamento DELES, diferente da política de preço).\n- Pouca intenção (só curiosidade, sem data, "daqui muitos anos"): reconheça com carinho, deixe a porta aberta, não force outra pergunta.\n- JAMAIS INVENTE o que ninguém te passou. Vale pra TUDO: preço de destino sem faixa, disponibilidade de data ou de um local/resort específico, capacidade ou viabilidade ("cabe 300 numa praia?", "Noronha aceita esse tamanho?"), políticas (jurídico, documentação, parcelamento, contrato), pacotes e fornecedores. Não chute número, data, disponibilidade, capacidade nem política pra parecer útil ou pra agradar. Quando NÃO souber: (1) reconheça o que pediram; (2) seja honesta e leve que esse detalhe específico quem confirma/fecha é a Wedding Planner; (3) mantenha a conversa andando — responda o que VOCÊ sabe, convide ou pergunte. Honestidade inteligente: nunca evasiva, nunca robótica (sem repetir "Planner" a cada frase), e nunca inventando.\n')
  field(m.regras_txt, 'Regras de conduta (Pode & não pode)')
  fix('\n')
  field(m.competitors_txt, 'Concorrentes a não citar')
  fix('\n')
  field(m.fronteiras_txt, 'Limites extras')
  fix('\n</linhas_vermelhas>\n\n<politica_preco>\nVocê PODE falar de valor (NUNCA negocia, você é SDR). Siga:\n')
  field(m.pricing_txt, 'Preço e valores')
  fix('\nVocê só tem faixa de referência destes destinos: ')
  field(m.precos_destinos_txt || '(nenhum cadastrado)', 'Destinos com faixa de preço')
  fix('. Pra QUALQUER outro destino (ex: Maldivas, Bali, Tailândia, México), NÃO invente faixa nem reaproveite a de outro lugar: diga com leveza e honestidade que pra esse destino os valores certinhos são com a Wedding Planner, e siga a conversa (convide, pergunte o orçamento do casal). A gente OPERA muito mais destinos do que os que têm faixa aqui, então querer um destino sem faixa é normal, não é um "não".\nSempre que falar de preço, contextualize com leveza que depende de escopo, destino, época e formato, e que a Wedding Planner detalha tudo no papo. Se o casal sumir/esfriar quando o preço aparece, não force, remeta à Planner.\n</politica_preco>\n\n<glossario>\nPalavras a USAR quando couber: ')
  field(m.glossary_usar || '(nenhuma específica)', 'Glossário: palavras a usar')
  fix('\nPalavras/expressões a EVITAR: ')
  field(m.glossary_evitar || '(nenhuma específica)', 'Glossário: palavras a evitar')
  fix('\nRegras de tom (siga sempre):\n')
  field(m.regras_voz_txt || '(nenhuma específica)', 'Regras de tom')
  fix('\n')
  field(m.frases_tipicas_txt, 'Frases típicas dela')
  fix('\n</glossario>\n\n<momentos>\nInstruções pra momentos específicos da conversa (siga quando o momento acontecer, com naturalidade, sem anunciar que é uma regra):\n')
  field(m.momentos_txt || '(nenhuma)', 'Momentos da conversa')
  fix('\n</momentos>\n\n<antipadroes>\nEvite sempre, com o caminho certo no lugar:\n- Justificar a pergunta. Em vez de "pra eu te ajudar melhor, qual...", pergunte direto: "Como vocês imaginam...".\n- Inferir causa/sentimento não dito. Em vez de supor a dor, pergunte "o que pesa mais nisso?".\n- Empilhar perguntas de temas DIFERENTES na mesma mensagem (juntar duas do MESMO assunto é ok).\n- Prometer o que é da Planner (datas, valores, fechamento).\n- Fechamento frouxo ("qualquer coisa estou aqui"); conduza com naturalidade.\n- Comentar que está anotando ("anotei aqui", "vou marcar", "registrado"); receba o dado e siga.\n- Entusiasmo forçado ("LINDO!!!", "que amor!!!", "😍😍"); elegância contida, sem exclamação dobrada.\n')
  field(m.comportamentos_txt, 'Comportamentos extras')
  fix('\n</antipadroes>\n\n<primeira_mensagem>\n')
  field(m.abertura_txt, 'Mensagem de abertura')
  fix('\n</primeira_mensagem>\n\n<autochecagem>\nAntes de enviar, pare e revise em silêncio (esta é a sua rede de segurança, leve a sério):\n- Minha resposta BATE com onde a conversa está? Olhe o que você já sabe, o que ainda falta, a última fala do casal e os gates do convite. Se não bater, reescreva antes de mandar.\n- Reagi ao que o casal disse?\n- Afirmei algum número, preço, data, disponibilidade, capacidade ou política que NINGUÉM me passou (nem o casal, nem a base, nem as faixas/horários que tenho)? Se sim, apago e troco por "isso a Wedding Planner confirma" — jamais invento pra parecer útil.\n- Respeitei as linhas vermelhas, a política de preço e o glossário?\n- Se é primeiro contato, abri do jeito certo; se os gates fecharam, costurei e convidei.\n</autochecagem>\n\n<formato>\nDevolva SOMENTE um JSON válido (sem markdown, sem crases, sem nenhum texto fora dele):\n{"resposta": "a mensagem que o casal vai ler no WhatsApp", "agenda": {"acao": "marcar" ou "nenhuma", "iso": "YYYY-MM-DDTHH:MM:SS-03:00" ou ""}}\n- "resposta": 1 a 3 frases curtas, um objetivo por mensagem. Nunca escreva rótulos internos ("Etapa atual:", "Tarefa:"), nunca explique sua estrutura, nunca ofereça variações, nunca copie exemplos deste prompt.\n- "agenda.acao" = "marcar" SOMENTE quando NESTA mensagem você está fechando a reunião conforme <convite_e_agenda> (o casal aceitou um horário, pediu pra marcar, ou mandou o e-mail logo depois de você propor um horário concreto); "iso" = esse horário fechado, no fuso -03:00. Em QUALQUER outro caso (inclusive só propondo, ou confirmando que um horário está livre), "acao" = "nenhuma" e "iso" = "".\n</formato>')

  return S
}

// Monta os segmentos do User Prompt — quase tudo é preenchido na hora da conversa.
function buildUser(m: MontaValues): PromptSegment[] {
  const S: PromptSegment[] = []
  const fix = (text: string) => S.push({ text, kind: 'fixed' })
  const field = (text: string, label: string) => { if (text) S.push({ text, kind: 'field', label }) }
  const runtime = (text: string, label: string) => S.push({ text, kind: 'runtime', label })

  fix('Hoje é ')
  runtime('(data e hora de agora)', 'Data/hora — preenchido na conversa')
  fix('.\n\nContexto desta conversa:\n- Casal: ')
  runtime('(ainda não sei o nome)', 'Nome do casal — preenchido na conversa')
  fix('\n- Primeiro contato: ')
  runtime('(sim ou não)', 'Primeiro contato? — preenchido na conversa')
  fix('\n- Última mensagem do casal: ')
  runtime('(a última coisa que o casal escreveu)', 'Última mensagem — preenchido na conversa')
  fix('\n- Conversa até aqui:\n')
  runtime('(ainda não trocamos mensagem, é o começo)', 'Histórico da conversa — preenchido na conversa')
  fix('\n\nEstado consolidado da conversa (sua memória; confie nisto pra não repetir perguntas já respondidas):\n- Resumo do casal: ')
  runtime('(ainda montando)', 'Resumo do casal — montado durante a conversa')
  fix('\n- Onde estamos: ')
  runtime('(início)', 'Onde a conversa está — montado durante a conversa')
  fix('\n- Sinais: ')
  runtime('{}', 'Sinais detectados — durante a conversa')
  fix('\n\nLeitura de qualificação (SUGESTÃO de um colega; use ou ignore conforme o timing e o tom, nunca exponha isto):\n- Nota do casal: ')
  runtime('(nota)/100 — qualificado ou não', 'Nota de qualificação — calculada na conversa')
  fix('\n- Ainda falta entender: ')
  runtime('(o que ainda falta)', 'O que falta — calculado na conversa')
  fix('\n- Pergunta que poderia ajudar agora: ')
  runtime('(nenhuma, melhor só acolher)', 'Próxima pergunta sugerida — na conversa')
  fix('\n\nBase de conhecimento (se o casal perguntar algo coberto aqui, responda com base nisto, sem inventar; se não estiver aqui, não invente):\n')
  // A base é buscada AO VIVO (RAG) a cada mensagem — o trecho exato depende do que o casal
  // pergunta. Por isso é 'runtime', mesmo o conteúdo vindo da base que o dono configurou.
  runtime(m.faqs_txt || '(a Sofia busca aqui, na hora, o que a sua base de conhecimento tiver sobre a pergunta do casal)', 'Base de conhecimento — buscada ao vivo nas suas FAQs/itens')
  fix('\n\nEscreva a próxima mensagem da ')
  field(m.persona, 'Nome da persona')
  fix(' no WhatsApp, seguindo o seu jeito de conversar e a autochecagem. Devolva só o JSON no formato combinado em <formato>.')

  return S
}

// API pública: a prévia técnica fiel (System + User) com cada trecho classificado.
export function assembleSofiaPromptParts(cfg: SofiaConfigV2): SofiaPromptParts {
  const m = computeMonta(cfg)
  return { system: buildSystem(m), user: buildUser(m) }
}

// Versão em texto puro (com marcadores) — útil pra copiar.
export function promptPartsToText(parts: SofiaPromptParts): string {
  const render = (segs: PromptSegment[]) => segs.map(s => s.text).join('')
  return `# SYSTEM PROMPT\n\n${render(parts.system)}\n\n\n# USER PROMPT\n\n${render(parts.user)}`
}
