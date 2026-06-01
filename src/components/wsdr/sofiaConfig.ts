// Modelo de configuração v2 da Sofia (e clones). Espelha o JSONB de wsdr_agent_config
// criado na migration 20260530a_wsdr_foundation.sql. O esqueleto de raciocínio fica
// no n8n (código); aqui moram só as DECISÕES DE NEGÓCIO editáveis pelo leigo.

export type Tom = 'acolhedor' | 'formal' | 'direto'

export interface CalendarWindow {
  dias: number[] // 0=dom ... 6=sáb
  inicio: string // "10:00"
  fim: string // "17:00"
}

export interface SofiaCapabilities {
  crm_write: {
    enabled: boolean
    writable_fields: string[]
    protected_fields: string[]
    stage_move_enabled: boolean
    target_stage_id: string | null
  }
  calendar: {
    enabled: boolean
    wedding_planner_profile_id: string | null
    windows: CalendarWindow[]
    slot_duration_minutes: number
    skip_weekends: boolean
    max_slots: number
    search_window_days: number
  }
  knowledge: { enabled: boolean; top_k: number; faqs: { q: string; a: string }[] }
  followup: { enabled: boolean; default_time: string; days: number[] }
  multimodal: { enabled: boolean; audio: boolean; image: boolean; pdf: boolean }
  memory: {
    enabled: boolean
    window_messages: number
    debounce_ms: number
    bubbles_enabled: boolean
    bubble_delay_ms: number
  }
}

export type RevealStrategy = 'always' | 'on_question' | 'on_hesitation' | 'hand_to_planner'
export interface DestinationRange {
  destino: string
  moeda: string // BRL | USD | EUR
  tiers: { convidados: number; a_partir: number }[]
  contexto?: string
}
export interface SofiaPricing {
  mention_fee: boolean
  fee_min_brl: number
  fee_max_brl: number
  reveal_strategy: RevealStrategy
  tone_on_pushback: 'empathetic' | 'firm'
  can_negotiate: boolean
  destination_ranges: DestinationRange[]
}

export type MomentTrigger =
  | 'always' | 'on_price_question' | 'on_price_hesitation' | 'on_family_mentioned'
  | 'on_low_qualification' | 'on_high_qualification' | 'on_destination_unclear'
  | 'on_hesitation_timeout' | 'custom_condition'
export interface MomentActions { tag?: string | null; stage_id?: string | null; notify?: boolean }
export interface SofiaMoment {
  label: string
  instrucao: string
  trigger_type: MomentTrigger
  enabled: boolean
  // v3: descrição em linguagem natural de QUANDO disparar (só quando trigger_type='custom_condition')
  custom_condition_description?: string
  // v3: ações automáticas opcionais quando o momento dispara
  actions?: MomentActions
}
// Fases da conversa (espinha dorsal proativa): a ordem que a Sofia conduz.
// nome = a fase; objetivo = o que fazer/ritmo (linguagem simples); avancar_quando = condição pra ir pra próxima.
export interface SofiaPhase { nome: string; objetivo: string; avancar_quando: string }
export const MOMENT_TRIGGERS: { value: MomentTrigger; label: string; exemplo: string }[] = [
  { value: 'always', label: 'Em qualquer momento', exemplo: 'Vale pra conversa toda' },
  { value: 'on_price_question', label: 'Quando perguntam preço', exemplo: '"quanto custa?", "qual o valor?"' },
  { value: 'on_price_hesitation', label: 'Quando hesitam pelo valor', exemplo: '"tá caro", "vou ver se cabe"' },
  { value: 'on_family_mentioned', label: 'Quando citam a família', exemplo: '"meus pais", "minha sogra quer opinar"' },
  { value: 'on_destination_unclear', label: 'Quando o destino está indefinido', exemplo: '"ainda não sabemos onde"' },
  { value: 'on_high_qualification', label: 'Quando o casal está bem qualificado', exemplo: 'já tem destino, data, convidados e orçamento' },
  { value: 'on_low_qualification', label: 'Quando ainda falta qualificar', exemplo: 'faltam dados essenciais' },
  { value: 'on_hesitation_timeout', label: 'Quando hesitam ou querem pensar', exemplo: '"vou pensar", "depois eu vejo"' },
  { value: 'custom_condition', label: 'Condição que eu descrevo', exemplo: 'a própria instrução diz quando' },
]

export type Importancia = 'desqualifica' | 'baixa' | 'media' | 'alta' | 'essencial'
// rule_type categoriza o critério no cálculo de nota (orientação ao Qualificador-LLM,
// NÃO soma mecânica): qualifier soma, disqualifier derruba, bonus reforça (com teto).
export type RuleType = 'qualifier' | 'disqualifier' | 'bonus'
export interface QualCriterion {
  label: string
  importancia: Importancia
  // v3: pontos do item (orientação ao julgamento) e tipo de regra. Opcionais (defaults no Monta).
  weight?: number
  rule_type?: RuleType
}
export const IMPORTANCIA_OPTIONS: { value: Importancia; label: string; hint: string; color: string }[] = [
  { value: 'essencial', label: 'Essencial', hint: 'Sem isso, o casal não qualifica', color: 'indigo' },
  { value: 'alta', label: 'Alta', hint: 'Pesa bastante na nota', color: 'sky' },
  { value: 'media', label: 'Média', hint: 'Ajuda, mas não decide', color: 'slate' },
  { value: 'baixa', label: 'Baixa', hint: 'Conta pouco', color: 'slate' },
  { value: 'desqualifica', label: 'Desqualifica', hint: 'Se aparecer, derruba a nota', color: 'rose' },
]
export const RULE_TYPE_OPTIONS: { value: RuleType; label: string; hint: string; color: string }[] = [
  { value: 'qualifier', label: 'Qualifica', hint: 'Soma pontos quando o casal atende', color: 'indigo' },
  { value: 'disqualifier', label: 'Desqualifica', hint: 'Se aparecer, derruba a nota direto', color: 'rose' },
  { value: 'bonus', label: 'Bônus', hint: 'Reforça o caso (soma até o teto, não decide sozinho)', color: 'emerald' },
]
// Peso padrão por importância — usado quando o critério ainda não tem weight explícito.
export const DEFAULT_WEIGHT_BY_IMPORTANCIA: Record<Importancia, number> = {
  essencial: 10, alta: 5, media: 2, baixa: 1, desqualifica: 0,
}
export const WEIGHT_PRESETS: { label: string; value: number }[] = [
  { label: 'Leve', value: 1 }, { label: 'Médio', value: 2 }, { label: 'Forte', value: 5 }, { label: 'Alto', value: 10 },
]

// O que a Sofia faz quando o casal NÃO atinge a nota mínima.
export type FallbackAction = 'material_informativo' | 'encerrar_cordial' | 'nota_interna' | 'request_handoff'
export const FALLBACK_OPTIONS: { value: FallbackAction; label: string; hint: string }[] = [
  { value: 'material_informativo', label: 'Enviar material e encerrar', hint: 'Manda um material informativo e encerra com leveza.' },
  { value: 'encerrar_cordial', label: 'Encerrar com gentileza', hint: 'Encerra a conversa de forma cordial, sem material.' },
  { value: 'nota_interna', label: 'Registrar nota interna', hint: 'Anota internamente pro time, segue a conversa.' },
  { value: 'request_handoff', label: 'Chamar uma pessoa', hint: 'Passa pra um humano do time decidir.' },
]

// Sondagem — cada "slot" é um dado que a Sofia coleta, com prioridade e perguntas.
export type SlotPriority = 'critical' | 'preferred' | 'nice_to_have'
export interface DiscoverySlot {
  key: string
  label: string
  priority: SlotPriority
  questions: string[]      // vazio = a Sofia improvisa a pergunta
  coverage_notes?: string  // precisão necessária (ex: "data precisa de mês E ano")
  crm_field_key?: string | null
}
export const SLOT_PRIORITY_OPTIONS: { value: SlotPriority; label: string; hint: string; tone: string }[] = [
  { value: 'critical', label: 'Crítica', hint: 'Bloqueia o convite até ser preenchida', tone: 'rose' },
  { value: 'preferred', label: 'Importante', hint: 'Pergunta enquanto não qualificou; pula se já qualificou', tone: 'amber' },
  { value: 'nice_to_have', label: 'Extra', hint: 'Só pergunta se a conversa fluir natural', tone: 'slate' },
]

// Modo da mensagem de abertura: texto exato, diretriz (a IA compõe seguindo a orientação)
// ou livre (a IA compõe só com persona/proposta). Espelha <primeira_mensagem> no cérebro.
export type AberturaMode = 'literal' | 'directive' | 'free'
export const ABERTURA_MODE_OPTIONS: { value: AberturaMode; label: string; hint: string }[] = [
  { value: 'literal', label: 'Mensagem exata', hint: 'A Sofia manda exatamente este texto no primeiro contato.' },
  { value: 'directive', label: 'Só uma diretriz', hint: 'Você dá a orientação (o que dizer/perguntar) e a Sofia compõe a abertura com naturalidade.' },
  { value: 'free', label: 'Deixar a Sofia compor', hint: 'Sem texto fixo: ela abre sozinha seguindo a persona e a proposta da empresa.' },
]

// Reações naturais de escuta (toggles). Viram um bloco de CONTEÚDO no cérebro.
export interface ListeningConfig {
  echo_social: boolean            // responde a perguntas sociais ("e você, tudo bem?")
  acknowledge_observations: boolean // reconhece o que o casal observou antes de seguir
  handle_bursts: boolean          // junta uma rajada de mensagens em vez de responder uma a uma
  never_ignore: boolean           // nunca ignora algo que o casal disse
}

// Escalação: passar pra um humano após N turnos sem avançar.
export interface EscalationConfig { enabled: boolean; max_turns: number; message: string }

export interface SofiaConfigV2 {
  config_version: number
  identity: {
    persona_nome: string
    empresa: string
    proposta: string
    // v3 (opcionais)
    role?: string
    role_custom?: string
    mission_one_liner?: string
    company_description_override?: string
  }
  voice: {
    tom: Tom
    formalidade: number
    abertura: string
    glossary: { marca: string[]; proibida: string[] }
    // v3 (opcionais — defaults no normalize)
    abertura_mode?: AberturaMode
    tone_tags?: string[]
    rules?: string[]
    typical_phrases?: string[]
    forbidden_phrases?: string[]
    listening?: ListeningConfig
    examples?: string[]
  }
  qualification: {
    etapas: string[]
    faixas_orcamento: string[]
    criteria: QualCriterion[]
    gates: Record<string, unknown>
    // v3 (opcionais)
    scoring_enabled?: boolean
    threshold?: number
    bands?: { quente: number; morno: number }
    max_bonus_points?: number
    fallback_action?: FallbackAction
    discovery_slots?: DiscoverySlot[]
    silent_signals?: string[]
  }
  boundaries: {
    curadas: Record<string, boolean>
    custom: string[]
    comportamentos: string[]
    // v3
    escalation?: EscalationConfig
  }
  capabilities: SofiaCapabilities
  pricing: SofiaPricing
  moments: SofiaMoment[]
  phases: SofiaPhase[]
  // v3 top-level (opcionais — Fase 3)
  interaction_mode?: 'inbound' | 'outbound' | 'hybrid'
  ativa?: boolean
}

export const REVEAL_OPTIONS: { value: RevealStrategy; label: string; hint: string }[] = [
  { value: 'on_question', label: 'Só quando perguntam', hint: 'Menciona a assessoria de leve; mostra as faixas por destino só se o casal perguntar valor. (Recomendado)' },
  { value: 'always', label: 'Proativa (sempre)', hint: 'Já oferece assessoria e faixas cedo, sem esperar perguntarem.' },
  { value: 'on_hesitation', label: 'Só se hesitar', hint: 'Fala de valor apenas se o casal hesitar ou insistir.' },
  { value: 'hand_to_planner', label: 'Segurar e remeter à Planner', hint: 'Fala só da assessoria; faixas de casamento ficam pra Planner.' },
]

export function defaultPricing(): SofiaPricing {
  return {
    mention_fee: true,
    fee_min_brl: 4000,
    fee_max_brl: 18000,
    reveal_strategy: 'on_question',
    tone_on_pushback: 'empathetic',
    can_negotiate: false,
    destination_ranges: [
      { destino: 'Europa', moeda: 'EUR', tiers: [{ convidados: 20, a_partir: 18000 }, { convidados: 50, a_partir: 55000 }, { convidados: 100, a_partir: 120000 }], contexto: 'a partir de, conforme escopo' },
      { destino: 'Mendoza', moeda: 'USD', tiers: [{ convidados: 20, a_partir: 15000 }, { convidados: 50, a_partir: 26000 }, { convidados: 100, a_partir: 52000 }] },
      { destino: 'Nordeste', moeda: 'BRL', tiers: [{ convidados: 20, a_partir: 40000 }, { convidados: 50, a_partir: 100000 }, { convidados: 100, a_partir: 200000 }] },
      { destino: 'Caribe', moeda: 'USD', tiers: [{ convidados: 20, a_partir: 5000 }, { convidados: 50, a_partir: 10000 }, { convidados: 100, a_partir: 17000 }] },
    ],
  }
}

export const TOM_OPTIONS: { value: Tom; label: string; emoji: string; exemplo: string }[] = [
  { value: 'acolhedor', label: 'Acolhedor', emoji: '🤍', exemplo: 'Que lindo, me conta mais como vocês imaginam esse dia?' },
  { value: 'formal', label: 'Formal', emoji: '🎩', exemplo: 'Seria um prazer entender melhor a visão de vocês para o casamento.' },
  { value: 'direto', label: 'Direto', emoji: '🎯', exemplo: 'Pra eu te ajudar certo: qual o destino e quantos convidados?' },
]

// Linhas vermelhas curadas. CONTROLE TOTAL: todas editáveis (toggle real ligado ao cérebro).
// protectsQuality=true → desligar reduz qualidade/segurança; a UI mostra aviso (mas o dono manda).
export interface CuratedBoundary {
  key: string
  label: string
  hint: string
  defaultOn: boolean
  editable: boolean
  protectsQuality: boolean
}
export const CURATED_BOUNDARIES: CuratedBoundary[] = [
  // Protegem qualidade/segurança — editáveis, com aviso ao desligar.
  { key: 'no_price', label: 'Nunca dar preço fechado', hint: 'Remete o valor fechado à Wedding Planner. As faixas e a estratégia ficam na aba Preço.', defaultOn: true, editable: true, protectsQuality: true },
  { key: 'no_invented_date', label: 'Nunca inventar data ou horário', hint: 'Pergunta o melhor período e diz que reserva com a Planner.', defaultOn: true, editable: true, protectsQuality: true },
  { key: 'no_cliche', label: 'Nunca usar clichê', hint: '"casamento dos sonhos", "experiência premium", "pode deixar com a gente"…', defaultOn: true, editable: true, protectsQuality: true },
  { key: 'no_dash', label: 'Nunca usar travessão', hint: 'Usa vírgula, ponto ou reticências. Tem uma trava automática que acompanha este botão.', defaultOn: true, editable: true, protectsQuality: true },
  // Decisões de marca — você escolhe, sem aviso.
  { key: 'no_first_emoji', label: 'Sem emoji na 1ª mensagem', hint: 'Ligado: nada de emoji no primeiro contato. Desligado: ela pode usar emojis com leveza.', defaultOn: true, editable: true, protectsQuality: false },
  { key: 'no_ai_mention', label: 'Nunca dizer que é uma IA', hint: 'Ligado: atende como uma pessoa do time. Desligado: pode revelar que é uma assistente virtual.', defaultOn: false, editable: true, protectsQuality: false },
]

export type CapabilityKey = keyof SofiaCapabilities
export type CapStatus = 'pronto' | 'em_testes' | 'em_breve'

export interface CapabilityMeta {
  key: CapabilityKey
  title: string
  subtitle: string
  description: string
  icon: string // lucide name (resolved no componente)
  color: string // tailwind color base, ex "amber"
  status: CapStatus
}

// Metadados (texto pro leigo + status de fiação) de cada capacidade.
export const CAPABILITY_META: CapabilityMeta[] = [
  { key: 'crm_write', title: 'Registrar no CRM', subtitle: 'Grava o casal e o progresso no funil', description: 'Quando ligado, a Sofia cria o card do casal e atualiza os dados (destino, convidados, orçamento, data) conforme a conversa.', icon: 'Database', color: 'amber', status: 'em_testes' },
  { key: 'calendar', title: 'Marcar reunião', subtitle: 'Usa o calendário do próprio CRM', description: 'A Sofia marca a reunião de verdade no calendário do CRM quando o casal confirma um horário. O card avança sozinho pra "Reunião Agendada". Configure a Wedding Planner e os horários disponíveis.', icon: 'CalendarClock', color: 'sky', status: 'em_testes' },
  { key: 'knowledge', title: 'Base de conhecimento', subtitle: 'Responde dúvidas com as suas FAQs', description: 'A Sofia consulta as perguntas e respostas que você cadastrar antes de responder dúvidas do casal (e não inventa o que não está aqui).', icon: 'BookOpen', color: 'emerald', status: 'em_testes' },
  { key: 'followup', title: 'Follow-up', subtitle: 'Cria tarefas de retomada', description: 'Quando há interesse mas sem horário marcado, a Sofia agenda uma tarefa de retomar a conversa (dia 1, 3, 7).', icon: 'BellRing', color: 'violet', status: 'em_breve' },
  { key: 'multimodal', title: 'Áudio, foto e PDF', subtitle: 'Entende mensagens além de texto', description: 'A Sofia transcreve áudios, entende fotos de inspiração e lê PDFs que o casal mandar.', icon: 'Mic', color: 'rose', status: 'em_breve' },
  { key: 'memory', title: 'Memória e entrega humana', subtitle: 'Lembra da conversa e responde em bolhas', description: 'A Sofia junta mensagens rápidas, lembra o contexto e responde em pequenas bolhas com um delay natural.', icon: 'Sparkles', color: 'indigo', status: 'em_breve' },
]

export function defaultSofiaConfig(): SofiaConfigV2 {
  const curadas: Record<string, boolean> = {}
  CURATED_BOUNDARIES.forEach(b => { curadas[b.key] = b.defaultOn })
  return {
    config_version: 3,
    identity: {
      persona_nome: 'Sofia',
      empresa: 'Welcome Weddings',
      proposta: 'a gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina',
      role: 'SDR',
      mission_one_liner: '',
      company_description_override: '',
    },
    voice: {
      tom: 'acolhedor',
      formalidade: 0.5,
      abertura: 'Oi! Aqui é a Sofia, da Welcome Weddings, tudo bem? Como é o nome de vocês? A gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina. A ideia aqui é uma conversa rápida pra eu entender o que vocês esperam, tirar dúvidas e, se fizer sentido, marcar um papo com a nossa Wedding Planner. Pra começar: o que é o casamento pra vocês, e como vocês imaginam ele?',
      glossary: { marca: [], proibida: [] },
      abertura_mode: 'literal',
      tone_tags: [],
      rules: [],
      typical_phrases: [],
      forbidden_phrases: [],
      listening: { echo_social: true, acknowledge_observations: true, handle_bursts: true, never_ignore: true },
      examples: [],
    },
    qualification: {
      etapas: [
        'O que é o casamento pra vocês e como imaginam ele',
        'Destino ou região',
        'Número de convidados (estimado)',
        'Faixa de investimento / orçamento',
      ],
      faixas_orcamento: ['R$ 80 a 150 mil', 'R$ 150 a 250 mil', 'R$ 250 a 400 mil', 'R$ 400 mil ou mais'],
      criteria: [
        { label: 'Tem uma visão do casamento (o que significa pra eles + o estilo: praia, intimista, grande festa)', importancia: 'alta', weight: 5, rule_type: 'qualifier' },
        { label: 'Tem destino ou região em mente, ou está aberto a explorar (Nordeste, Trancoso, Caribe, Europa…)', importancia: 'alta', weight: 5, rule_type: 'qualifier' },
        { label: 'Tem ideia do número de convidados, mesmo aproximada', importancia: 'media', weight: 2, rule_type: 'qualifier' },
        { label: 'Tem orçamento ou faixa de investimento realista pro casal', importancia: 'essencial', weight: 10, rule_type: 'qualifier' },
        { label: 'Tem data ou época pretendida (o ano já vale)', importancia: 'media', weight: 2, rule_type: 'qualifier' },
        { label: 'Só curiosidade, sem intenção real, ou "daqui a muitos anos"', importancia: 'desqualifica', weight: 0, rule_type: 'disqualifier' },
      ],
      gates: {},
      scoring_enabled: false,
      threshold: 25,
      bands: { quente: 70, morno: 40 },
      max_bonus_points: 10,
      fallback_action: 'material_informativo',
      discovery_slots: [
        { key: 'visao', label: 'Visão do casamento (estilo, o que significa)', priority: 'preferred', questions: [], crm_field_key: null },
        { key: 'destino', label: 'Destino ou região', priority: 'critical', questions: [], crm_field_key: 'ww_destino' },
        { key: 'convidados', label: 'Número de convidados (estimado)', priority: 'preferred', questions: [], crm_field_key: 'ww_num_convidados' },
        { key: 'orcamento', label: 'Orçamento do casal', priority: 'critical', questions: [], crm_field_key: 'ww_orcamento_faixa' },
        { key: 'data', label: 'Data ou época pretendida', priority: 'nice_to_have', questions: [], crm_field_key: 'ww_data_casamento' },
      ],
      silent_signals: [
        'a família está ajudando a decidir',
        'hesitação por causa do valor',
        'urgência (data próxima ou pressa)',
        'destino ainda indefinido',
      ],
    },
    boundaries: {
      curadas,
      custom: [],
      comportamentos: [],
      escalation: { enabled: false, max_turns: 12, message: 'Vou chamar a nossa Wedding Planner pra conversar com vocês, tá bom?' },
    },
    capabilities: {
      crm_write: { enabled: false, writable_fields: [], protected_fields: [], stage_move_enabled: false, target_stage_id: null },
      calendar: { enabled: false, wedding_planner_profile_id: null, windows: [], slot_duration_minutes: 45, skip_weekends: true, max_slots: 4, search_window_days: 14 },
      knowledge: { enabled: false, top_k: 4, faqs: [] },
      followup: { enabled: false, default_time: '10:30', days: [1, 3, 7] },
      multimodal: { enabled: false, audio: true, image: true, pdf: true },
      memory: { enabled: false, window_messages: 10, debounce_ms: 8000, bubbles_enabled: true, bubble_delay_ms: 1500 },
    },
    pricing: defaultPricing(),
    moments: [
      { label: 'Quando perguntam preço', instrucao: 'Fale da assessoria com leveza (R$ 4 a 18 mil conforme escopo), contextualize que depende de destino, época e formato, e diga que a Wedding Planner detalha tudo na conversa. Não negocie.', trigger_type: 'on_price_question', enabled: true },
      { label: 'Quando citam a família', instrucao: 'Acolha: casamento é coisa de família. Diga que a Planner está acostumada a conversar com pais e família junto, sem pressão.', trigger_type: 'on_family_mentioned', enabled: true },
      { label: 'Quando o destino ainda está indefinido', instrucao: 'Não trave. Pergunte se têm um lugar no coração ou se estão abertos a explorar, e cite regiões que a gente conhece bem (Nordeste, Trancoso, Caribe, Europa).', trigger_type: 'on_destination_unclear', enabled: true },
    ],
    phases: [
      { nome: 'Apresentação', objetivo: 'Só se apresente de leve e faça no máximo UMA pergunta aberta (o nome do casal ou o que imaginam pro casamento). Não despeje tudo de uma vez, não fale de preço nem de detalhes ainda.', avancar_quando: 'O casal responder e você souber o nome ou o que eles buscam.' },
      { nome: 'Sondagem', objetivo: 'Entenda a visão do casal e o destino/região, uma pergunta aberta por vez, reagindo ao que disseram. Deixe o casal falar mais que você.', avancar_quando: 'Você já tem uma boa noção da visão e do destino/região.' },
      { nome: 'Qualificação', objetivo: 'Entenda número de convidados (estimado), o orçamento do casal e a data/época pretendida. Com leveza, uma coisa de cada vez.', avancar_quando: 'Você tem o essencial: visão, destino, convidados, orçamento e algum sinal de data/intenção.' },
      { nome: 'Convite', objetivo: 'Costure numa frase o que entendeu, com as palavras do casal, e convide pra uma conversa com a Wedding Planner. Pergunte o melhor período, sem inventar horário.', avancar_quando: 'O casal aceitar conversar com a Planner.' },
    ],
  }
}

// Migra um config possivelmente antigo (flat v1) para a forma v2, sem perder dados.
export function normalizeToV2(raw: unknown): SofiaConfigV2 {
  const def = defaultSofiaConfig()
  if (!raw || typeof raw !== 'object') return def
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migração tolerante a formatos antigos
  const c = raw as Record<string, any>
  if ((c.config_version === 2 || c.config_version === 3) && c.identity && c.capabilities) {
    // mescla com defaults pra garantir todas as chaves (v2 e v3)
    return {
      ...def,
      ...c,
      identity: { ...def.identity, ...c.identity },
      voice: { ...def.voice, ...c.voice, listening: { ...def.voice.listening!, ...(c.voice?.listening || {}) } },
      qualification: {
        ...def.qualification, ...c.qualification,
        bands: { ...def.qualification.bands!, ...(c.qualification?.bands || {}) },
        discovery_slots: c.qualification?.discovery_slots ?? def.qualification.discovery_slots,
        silent_signals: c.qualification?.silent_signals ?? def.qualification.silent_signals,
      },
      boundaries: {
        curadas: { ...def.boundaries.curadas, ...(c.boundaries?.curadas || {}) },
        custom: c.boundaries?.custom || [],
        comportamentos: c.boundaries?.comportamentos || [],
        escalation: { ...def.boundaries.escalation!, ...(c.boundaries?.escalation || {}) },
      },
      capabilities: {
        crm_write: { ...def.capabilities.crm_write, ...(c.capabilities?.crm_write || {}) },
        calendar: { ...def.capabilities.calendar, ...(c.capabilities?.calendar || {}) },
        knowledge: { ...def.capabilities.knowledge, ...(c.capabilities?.knowledge || {}) },
        followup: { ...def.capabilities.followup, ...(c.capabilities?.followup || {}) },
        multimodal: { ...def.capabilities.multimodal, ...(c.capabilities?.multimodal || {}) },
        memory: { ...def.capabilities.memory, ...(c.capabilities?.memory || {}) },
      },
      pricing: { ...def.pricing, ...(c.pricing || {}), destination_ranges: c.pricing?.destination_ranges ?? def.pricing.destination_ranges },
    }
  }
  // v1 flat -> v3 (preserva defaults v3 das sub-estruturas)
  return {
    ...def,
    identity: { ...def.identity, persona_nome: c.persona_nome || def.identity.persona_nome, empresa: c.empresa || def.identity.empresa, proposta: c.proposta || def.identity.proposta },
    voice: { ...def.voice, tom: (c.tom as Tom) || def.voice.tom, abertura: c.abertura || def.voice.abertura },
    qualification: { ...def.qualification, etapas: c.etapas || def.qualification.etapas, faixas_orcamento: c.faixas_orcamento || def.qualification.faixas_orcamento },
    boundaries: { ...def.boundaries, custom: c.fronteiras || [] },
  }
}

// Preview em LINGUAGEM HUMANA (nunca prompt cru) — o que a Sofia vai fazer.
export function humanPromptPreview(cfg: SofiaConfigV2): string {
  const tom = TOM_OPTIONS.find(t => t.value === cfg.voice.tom)?.label.toLowerCase() || cfg.voice.tom
  const caps = CAPABILITY_META.filter(m => cfg.capabilities[m.key].enabled).map(m => m.title)
  const fronteirasLigadas = CURATED_BOUNDARIES.filter(b => cfg.boundaries.curadas[b.key]).map(b => b.label)
  const lines: string[] = []
  lines.push(`A ${cfg.identity.persona_nome} se apresenta como especialista da ${cfg.identity.empresa} e conversa de um jeito ${tom}.`)
  if (cfg.identity.proposta) lines.push(`O que ela vende: ${cfg.identity.proposta}.`)
  lines.push('')
  lines.push('No primeiro contato ela diz:')
  lines.push(`"${cfg.voice.abertura.slice(0, 220)}${cfg.voice.abertura.length > 220 ? '…' : ''}"`)
  if (cfg.phases && cfg.phases.length) {
    lines.push('')
    lines.push('Ela conduz a conversa nestas fases, em ordem:')
    cfg.phases.forEach((p, i) => lines.push(`  ${i + 1}. ${p.nome}: ${p.objetivo}`))
  }
  lines.push('')
  lines.push('Ao longo da conversa ela vai entendendo, uma coisa de cada vez:')
  cfg.qualification.etapas.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`))
  if (cfg.qualification.faixas_orcamento.length) {
    lines.push('')
    lines.push(`Se o casal não quiser dizer um valor, ela oferece estas faixas: ${cfg.qualification.faixas_orcamento.join('; ')}.`)
  }
  lines.push('')
  lines.push('Ela NUNCA faz:')
  fronteirasLigadas.forEach(f => lines.push(`  • ${f}`))
  cfg.boundaries.custom.forEach(f => lines.push(`  • ${f}`))
  lines.push('')
  lines.push(caps.length ? `Capacidades ligadas: ${caps.join(', ')}.` : 'Nenhuma capacidade extra ligada (ela só conversa, por enquanto).')
  return lines.join('\n')
}
