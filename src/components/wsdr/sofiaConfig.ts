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
    wedding_planner_profile_id: string | null // legado (1 planner); use closer_ids
    closer_ids: string[]            // v4: closers (Wedding Planners) que podem receber reunião
    windows: CalendarWindow[]       // dias úteis + faixas de horário
    slot_duration_minutes: number   // duração da reunião
    slot_interval_minutes: number   // granularidade dos horários oferecidos (ex: 30 → 14h, 14h30)
    slots_per_day: number           // máximo de horários por dia
    min_lead_hours: number          // antecedência mínima (ex: 1 = pode hoje, ≥ agora+1h)
    skip_weekends: boolean
    max_slots: number               // total de horários a oferecer (abrange alguns dias)
    search_window_days: number      // dias à frente, no máximo
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
  // v4: passar pra um humano quando ela trava ou o casal fica insatisfeito / pede gente.
  handoff: {
    enabled: boolean
    situations: string[]        // quando passar (editável): "pede falar com humano", "repetiu que não entendeu", "demonstra insatisfação"
    max_turns_stuck: number     // travou: nº de trocas sem avançar antes de passar
    target_stage_id: string | null // etapa pra onde mover o card ao passar
    notify: boolean             // avisa o time
    transition_message: string  // o que ela diz ao passar (humano, sem prometer prazo)
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
  | 'on_destination_off_catalog' | 'on_honeymoon' | 'on_closing_signal'
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
  { value: 'on_destination_off_catalog', label: 'Quando o destino está fora do catálogo', exemplo: '"tem que ser Bali", Ásia, lugares que a gente não opera' },
  { value: 'on_honeymoon', label: 'Quando falam em lua de mel', exemplo: '"queremos já emendar a viagem"' },
  { value: 'on_closing_signal', label: 'Quando o casal está encerrando', exemplo: '"ok", "blz", "obrigado", "depois eu vejo"' },
  { value: 'on_high_qualification', label: 'Quando o casal está bem qualificado', exemplo: 'já tem destino, data, convidados e orçamento' },
  { value: 'on_low_qualification', label: 'Quando ainda falta qualificar', exemplo: 'faltam dados essenciais' },
  { value: 'on_hesitation_timeout', label: 'Quando hesitam ou querem pensar', exemplo: '"vou pensar", "depois eu vejo"' },
  { value: 'custom_condition', label: 'Condição que eu descrevo', exemplo: 'a própria instrução diz quando' },
]

export type Importancia = 'desqualifica' | 'baixa' | 'media' | 'alta' | 'essencial'
// rule_type categoriza o critério no cálculo de nota (orientação ao Qualificador-LLM,
// NÃO soma mecânica): qualifier soma, disqualifier derruba, bonus reforça (com teto).
export type RuleType = 'qualifier' | 'disqualifier' | 'bonus'

// v4 — CRITÉRIO INTERLIGADO: cada critério junta O QUE descobrir (label) + COMO perguntar
// (como_perguntar; vazio = a Sofia improvisa, mas sabe o alvo pelo label) + COMO pontua (kind):
//   • sim_nao        → a IA julga "atende?"; soma `weight` se sim.
//   • faixas_valor   → calcula um valor (ex: R$ por convidado) e a faixa que ele cai dá os pontos.
//   • peso_por_opcao → cada opção (ex: destino) vale X pontos; fora da lista = 0 ou desqualifica.
//   • desqualifica   → se "atende", zera a nota (hard-stop).
// perguntar_quando: 'sempre' ou 'fronteira' (aprofundamento — só puxa quando o casal está no limite).
export type CriterionKind = 'sim_nao' | 'faixas_valor' | 'peso_por_opcao' | 'desqualifica'
export type PerguntarQuando = 'sempre' | 'fronteira'
export interface CriterionFaixa { de?: number | null; ate?: number | null; pontos: number; rotulo?: string }
export interface CriterionOpcao { opcao: string; pontos: number }
export interface QualCriterion {
  label: string                  // o que descobrir (o alvo — também o que a IA usa pra improvisar a pergunta)
  importancia: Importancia
  weight?: number                // pontos (sim_nao). Defaults vêm de DEFAULT_WEIGHT_BY_IMPORTANCIA.
  rule_type?: RuleType           // compat; derivado de kind quando ausente
  // v4 interligado (todos opcionais — normalize/Monta dão defaults):
  kind?: CriterionKind           // default 'sim_nao' (ou 'desqualifica' se importancia='desqualifica')
  como_perguntar?: string        // pergunta literal (vazio = improvisa pelo label)
  perguntar_quando?: PerguntarQuando // 'sempre' (default) | 'fronteira' (aprofundamento)
  crm_field_key?: string | null  // fixa onde guardar na ficha (opcional)
  // faixas_valor:
  base?: 'por_convidado' | 'total' // como calcular o valor antes de cair na faixa
  faixas?: CriterionFaixa[]
  // peso_por_opcao:
  opcoes?: CriterionOpcao[]
  fora_da_lista?: 'zero' | 'desqualifica' // comportamento quando a opção não está na lista
}
export const CRITERION_KIND_OPTIONS: { value: CriterionKind; label: string; hint: string }[] = [
  { value: 'sim_nao', label: 'Tem ou não tem', hint: 'A Sofia julga se o casal atende e soma os pontos (ex: tem visão, tem data).' },
  { value: 'faixas_valor', label: 'Faixa de valor', hint: 'Calcula um número (ex: R$ por convidado) e a faixa em que cai dá os pontos.' },
  { value: 'peso_por_opcao', label: 'Peso por opção', hint: 'Cada opção vale um tanto (ex: Caribe 20, Europa 5). Fora da lista pode zerar ou desqualificar.' },
  { value: 'desqualifica', label: 'Desqualifica', hint: 'Se aparecer, derruba a nota na hora (ex: só curiosidade).' },
]
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
// Escala calibrada pra somar ~100 quando o casal atende tudo — a nota se lê como
// "de 0 a 100", igual à da IA quando a pontuação está desligada. Mantém a MESMA lógica
// determinística da Patricia (soma de pesos), só com uma escala que faz a nota mínima e
// as faixas baterem com o que é alcançável.
export const DEFAULT_WEIGHT_BY_IMPORTANCIA: Record<Importancia, number> = {
  essencial: 35, alta: 20, media: 12, baixa: 5, desqualifica: 0,
}
export const WEIGHT_PRESETS: { label: string; value: number }[] = [
  { label: 'Leve', value: 5 }, { label: 'Médio', value: 12 }, { label: 'Forte', value: 20 }, { label: 'Essencial', value: 35 },
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
  { value: 'directive', label: 'Diretriz (recomendado)', hint: 'Você diz os PONTOS que ela deve cobrir; ela compõe a abertura E responde ao que o casal escreveu, como um SDR humano (não ignora a pergunta deles).' },
  { value: 'free', label: 'Deixar a Sofia compor', hint: 'Sem pontos definidos: ela abre sozinha, respondendo o que disseram + persona e proposta.' },
]

// Abertura em PASSOS: sequência editável. Cada passo é uma fala + se ela ESPERA a resposta
// + o que CAPTURA ali (nome hoje, qualquer coisa amanhã). Modo 'stepped' usa isto; 'single'
// usa o texto único de voice.abertura (compat). A IA sempre reage ao que o casal disse (traço
// global em <como_voce_conversa>), então o passo carrega só a fala + a pausa + a captura.
export interface OpeningStep {
  fala: string            // o que ela diz neste passo (diretriz, não precisa ser literal)
  espera_resposta: boolean // pausa e espera o casal responder antes do próximo passo?
  captura?: string | null  // o que tentar captar aqui (ex: "nome"); null = nada específico
}

// Reações naturais de escuta (toggles). Viram um bloco de CONTEÚDO no cérebro.
export interface ListeningConfig {
  echo_social: boolean            // responde a perguntas sociais ("e você, tudo bem?")
  acknowledge_observations: boolean // reconhece o que o casal observou antes de seguir
  handle_bursts: boolean          // junta uma rajada de mensagens em vez de responder uma a uma
  never_ignore: boolean           // nunca ignora algo que o casal disse
}

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
    // v4: abertura em passos. opening_stepped=true usa opening_steps; senão usa o texto único.
    opening_stepped?: boolean
    opening_steps?: OpeningStep[]
    tone_tags?: string[]
    rules?: string[]
    typical_phrases?: string[]
    forbidden_phrases?: string[]
    listening?: ListeningConfig
    examples?: string[]
    // Como ela reage ao que o casal diz (antes era fixo no código).
    reaction?: string
  }
  qualification: {
    etapas: string[]
    faixas_orcamento: string[]
    criteria: QualCriterion[]
    gates: Record<string, unknown>
    // v3 (opcionais)
    scoring_enabled?: boolean
    threshold?: number
    max_bonus_points?: number
    // Quando ela convida pra Planner (antes era fixo no código).
    invite_gates?: string
    fallback_action?: FallbackAction
    discovery_slots?: DiscoverySlot[]
    silent_signals?: string[]
  }
  boundaries: {
    curadas: Record<string, boolean>
    custom: string[]
    comportamentos: string[]
    // v3
    competitors_to_avoid?: string[]
    // v3.1: lista unificada e editável de regras (substitui curadas+comportamentos na UI)
    regras?: SofiaRule[]
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

// Regra editável de conduta (unifica as curadas + as customizadas). O dono edita o TEXTO,
// liga/desliga, adiciona e remove. id presente = regra "de fábrica" com fiação especial
// (ex: no_dash gera a trava automática de travessão); sem id = regra própria do dono.
export interface SofiaRule { id?: string; texto: string; ativa: boolean; protege: boolean }

// Texto padrão (editável) de cada regra de fábrica — o que entra no cérebro quando ligada.
export const CURATED_RULE_TEXT: Record<string, string> = {
  no_price: 'Nunca dê um preço fechado ou final como definitivo; o valor fechado é com a Wedding Planner (você pode falar de faixas e da assessoria).',
  no_invented_date: 'Nunca invente data nem horário; pergunte o melhor período e diga que reserva com a Planner.',
  no_cliche: 'Zero clichê batido (casamento dos sonhos, experiência premium, pode deixar com a gente, transformar sonhos em realidade).',
  no_dash: 'Zero travessão ou hífen como separador; use vírgula, ponto ou reticências.',
  no_first_emoji: 'Zero emoji na primeira mensagem; depois no máximo um, só se o casal usar primeiro.',
  no_ai_mention: 'Nunca diga que é uma IA, robô, assistente virtual ou sistema; atenda como uma pessoa do time.',
}

// Constrói a lista de regras a partir do estado legado (curadas on/off + comportamentos livres).
export function buildRegrasFromLegacy(curadas: Record<string, boolean>, comportamentos: string[]): SofiaRule[] {
  const fromCurated: SofiaRule[] = CURATED_BOUNDARIES.map(b => ({
    id: b.key,
    texto: CURATED_RULE_TEXT[b.key] || b.label,
    ativa: curadas?.[b.key] ?? b.defaultOn,
    protege: b.protectsQuality,
  }))
  const fromCustom: SofiaRule[] = (comportamentos || []).filter(Boolean).map(t => ({ texto: t, ativa: true, protege: false }))
  return [...fromCurated, ...fromCustom]
}

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
  { key: 'followup', title: 'Follow-up', subtitle: 'Cria tarefas de retomada', description: 'Quando há interesse mas sem horário marcado, a Sofia agenda uma tarefa de retomar a conversa (dia 1, 3, 7).', icon: 'BellRing', color: 'violet', status: 'em_testes' },
  { key: 'multimodal', title: 'Áudio, foto e PDF', subtitle: 'Entende mensagens além de texto', description: 'A Sofia transcreve áudios, entende fotos de inspiração e lê PDFs que o casal mandar.', icon: 'Mic', color: 'rose', status: 'em_testes' },
  { key: 'memory', title: 'Memória e entrega humana', subtitle: 'Lembra da conversa e responde em bolhas', description: 'A Sofia junta mensagens rápidas, lembra o contexto e responde em pequenas bolhas com um delay natural.', icon: 'Sparkles', color: 'indigo', status: 'em_testes' },
  { key: 'handoff', title: 'Passar pra um humano', subtitle: 'Quando trava ou o casal quer gente', description: 'Quando a Sofia trava (o casal repete que não entendeu, pede falar com alguém ou demonstra insatisfação), ela para de insistir e passa pra uma pessoa do time, marcando o card e avisando.', icon: 'UserRoundCheck', color: 'orange', status: 'em_testes' },
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
      abertura_mode: 'directive',
      opening_stepped: false,
      opening_steps: [
        { fala: 'Cumprimenta de leve e pergunta o nome do casal.', espera_resposta: true, captura: 'nome' },
        { fala: 'Conta em uma linha que a Welcome faz destination wedding desde 2012, premiada; e que a ideia é uma conversa rápida pra entender o que esperam e, se fizer sentido, marcar com a Wedding Planner.', espera_resposta: false, captura: null },
        { fala: 'Pergunta: o que é o casamento pra vocês, e como vocês imaginam ele?', espera_resposta: true, captura: 'visao' },
      ],
      tone_tags: [],
      rules: [
        'Use "a gente", nunca "nós"',
        'Trate o casal por "vocês"',
        'Frases curtas, português natural',
      ],
      typical_phrases: [],
      reaction: 'Reaja ao que o casal disse quando tiver peso de verdade (uma pergunta, um sonho, uma dor): acolhe e segue. Não comente trivialidades (de onde vieram, o canal) nem repita o óbvio.',
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
        {
          label: 'Visão do casamento (o que significa + o estilo: praia, intimista, grande festa)',
          importancia: 'alta', kind: 'sim_nao', weight: 20, rule_type: 'qualifier',
          como_perguntar: '', perguntar_quando: 'sempre', crm_field_key: null,
        },
        {
          label: 'Destino ou região', importancia: 'alta', kind: 'peso_por_opcao', rule_type: 'qualifier',
          como_perguntar: 'Já têm um lugar em mente, ou estão abertos a explorar?',
          perguntar_quando: 'sempre', crm_field_key: 'ww_destino', fora_da_lista: 'zero',
          opcoes: [
            { opcao: 'Caribe', pontos: 20 },
            { opcao: 'Nordeste', pontos: 15 },
            { opcao: 'Mendoza', pontos: 10 },
            { opcao: 'Maldivas', pontos: 5 },
            { opcao: 'Europa', pontos: 5 },
          ],
        },
        {
          label: 'Número de convidados que vão de fato (não a lista de convites)',
          importancia: 'media', kind: 'sim_nao', weight: 12, rule_type: 'qualifier',
          como_perguntar: 'Dos convidados, quantos vocês acham que vão de fato? Destination wedding costuma ter presença diferente.',
          perguntar_quando: 'sempre', crm_field_key: 'ww_num_convidados',
        },
        {
          label: 'Orçamento por convidado (quanto investem ÷ quantos vão)',
          importancia: 'essencial', kind: 'faixas_valor', base: 'por_convidado', rule_type: 'qualifier',
          como_perguntar: 'Quanto vocês pensam em investir no casamento em si?',
          perguntar_quando: 'sempre', crm_field_key: 'ww_orcamento_faixa',
          faixas: [
            { de: 3000, ate: null, pontos: 25, rotulo: 'R$ 3.000+ por convidado' },
            { de: 2500, ate: 3000, pontos: 20, rotulo: 'R$ 2.500 a 3.000' },
            { de: 2000, ate: 2500, pontos: 15, rotulo: 'R$ 2.000 a 2.500' },
            { de: 1500, ate: 2000, pontos: 10, rotulo: 'R$ 1.500 a 2.000' },
            { de: 1000, ate: 1500, pontos: 5, rotulo: 'R$ 1.000 a 1.500' },
            { de: null, ate: 1000, pontos: 0, rotulo: 'abaixo de R$ 1.000' },
          ],
        },
        {
          label: 'Data ou época pretendida (o ano já vale)',
          importancia: 'media', kind: 'sim_nao', weight: 12, rule_type: 'qualifier',
          como_perguntar: '', perguntar_quando: 'sempre', crm_field_key: 'ww_data_casamento',
        },
        {
          label: 'A família ajuda no investimento',
          importancia: 'media', kind: 'sim_nao', weight: 10, rule_type: 'qualifier',
          como_perguntar: 'Em alguns casamentos a família entra ajudando. No caso de vocês também vai ser assim?',
          perguntar_quando: 'fronteira', crm_field_key: 'ww_sdr_ajuda_familia',
        },
        {
          label: 'Viajaram pro exterior nos últimos 12 meses',
          importancia: 'media', kind: 'sim_nao', weight: 10, rule_type: 'qualifier',
          como_perguntar: 'Rolou alguma viagem internacional nos últimos meses? Pra onde foram?',
          perguntar_quando: 'fronteira', crm_field_key: 'ww_sdr_perfil_viagem_internacional',
        },
        {
          label: 'Só curiosidade, sem intenção real, ou "daqui a muitos anos"',
          importancia: 'desqualifica', kind: 'desqualifica', weight: 0, rule_type: 'disqualifier',
          como_perguntar: '', perguntar_quando: 'sempre',
        },
      ],
      gates: {},
      scoring_enabled: false,
      threshold: 50,
      max_bonus_points: 10,
      invite_gates: 'Só convide pra Wedding Planner quando TUDO for verdadeiro:\n- Você sabe o nome do casal.\n- O casal está qualificado pelos seus critérios (a leitura de qualificação diz "qualificado: sim").\n- Há sinal de vontade real de seguir ou data pretendida.\nData definida ou pedido de prioridade é sinal forte pra convidar assim que isso acontecer.',
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
      competitors_to_avoid: [],
      regras: buildRegrasFromLegacy(curadas, []),
    },
    capabilities: {
      crm_write: { enabled: false, writable_fields: ['ww_destino', 'ww_num_convidados', 'ww_orcamento_faixa', 'ww_data_casamento', 'ww_nome_parceiro', 'ww_tipo_casamento', 'ww_mkt_como_conheceu', 'ww_sdr_ajuda_familia', 'ww_sdr_perfil_viagem_internacional'], protected_fields: [], stage_move_enabled: false, target_stage_id: null },
      calendar: { enabled: false, wedding_planner_profile_id: null, closer_ids: [], windows: [{ dias: [1, 2, 3, 4, 5], inicio: '10:00', fim: '17:00' }], slot_duration_minutes: 45, slot_interval_minutes: 30, slots_per_day: 6, min_lead_hours: 1, skip_weekends: true, max_slots: 18, search_window_days: 14 },
      knowledge: { enabled: false, top_k: 4, faqs: [] },
      followup: { enabled: false, default_time: '10:30', days: [1, 3, 7] },
      multimodal: { enabled: false, audio: true, image: true, pdf: true },
      memory: { enabled: false, window_messages: 10, debounce_ms: 8000, bubbles_enabled: true, bubble_delay_ms: 1500 },
      handoff: {
        enabled: false,
        situations: ['o casal pede pra falar com uma pessoa', 'o casal repetiu que não entendeu', 'o casal demonstra insatisfação ou irritação'],
        max_turns_stuck: 4,
        target_stage_id: null,
        notify: true,
        transition_message: 'Deixa eu chamar alguém do nosso time pra falar com vocês, tá? Já já entram em contato.',
      },
    },
    pricing: defaultPricing(),
    moments: [
      { label: 'Quando perguntam preço', instrucao: 'Fale da assessoria com leveza (R$ 4 a 18 mil conforme escopo), contextualize que depende de destino, época e formato, e diga que a Wedding Planner detalha tudo na conversa. Não negocie.', trigger_type: 'on_price_question', enabled: true },
      { label: 'Quando citam a família', instrucao: 'Acolha: casamento é coisa de família. Diga que a Planner está acostumada a conversar com pais e família junto, sem pressão.', trigger_type: 'on_family_mentioned', enabled: true },
      { label: 'Quando o destino ainda está indefinido', instrucao: 'Não trave. Pergunte se têm um lugar no coração ou se estão abertos a explorar, e cite regiões que a gente conhece bem (Nordeste, Trancoso, Caribe, Europa).', trigger_type: 'on_destination_unclear', enabled: true },
      { label: 'Quando o destino está fora do que a gente opera', instrucao: 'Sonde a flexibilidade com leveza: a gente trabalha Caribe, Nordeste, Mendoza, Maldivas e Europa. Se toparem explorar, ótimo. Se forem inflexíveis num lugar fora disso (ex: Bali, Ásia), seja transparente que a gente não opera lá com a qualidade que promete, sem prometer, e encerre com elegância.', trigger_type: 'on_destination_off_catalog', enabled: true },
      { label: 'Quando falam em lua de mel', instrucao: 'A lua de mel é com o time de Travel Planner da Welcome Trips. Diga que conecta vocês em paralelo, sem misturar com o orçamento do casamento. Nunca prometa entregar a viagem você mesma.', trigger_type: 'on_honeymoon', enabled: true },
      { label: 'Quando dizem que vão pensar', instrucao: 'Acolha sem pressionar, é decisão grande. Pergunte de leve o que pesa mais (o destino, o investimento, ou conversar entre vocês), aceite a resposta e deixe a porta aberta.', trigger_type: 'on_hesitation_timeout', enabled: true },
      { label: 'Quando o casal sinaliza fim da conversa', instrucao: 'Quando vier ok/blz/obrigado/depois eu vejo, responda com UMA frase curta e calorosa de despedida e ENCERRE. Não ofereça ajuda de novo nem repita o que já falou.', trigger_type: 'on_closing_signal', enabled: true },
    ],
    phases: [
      { nome: 'Apresentação', objetivo: 'Só se apresente de leve e faça no máximo UMA pergunta aberta (o nome do casal ou o que imaginam pro casamento). Não despeje tudo de uma vez, não fale de preço nem de detalhes ainda.', avancar_quando: 'O casal responder e você souber o nome ou o que eles buscam.' },
      { nome: 'Sondagem', objetivo: 'Entenda a visão do casal e o destino/região, uma pergunta aberta por vez, reagindo ao que disseram. Deixe o casal falar mais que você.', avancar_quando: 'Você já tem uma boa noção da visão e do destino/região.' },
      { nome: 'Qualificação', objetivo: 'Entenda número de convidados (estimado), o orçamento do casal e a data/época pretendida. Com leveza, uma coisa de cada vez.', avancar_quando: 'Você tem o essencial: visão, destino, convidados, orçamento e algum sinal de data/intenção.' },
      { nome: 'Convite', objetivo: 'Costure numa frase o que entendeu, com as palavras do casal, e convide pra uma conversa com a Wedding Planner. Pergunte o melhor período, sem inventar horário.', avancar_quando: 'O casal aceitar conversar com a Planner.' },
    ],
    interaction_mode: 'inbound',
    ativa: true,
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
      voice: {
        ...def.voice, ...c.voice,
        listening: { ...def.voice.listening!, ...(c.voice?.listening || {}) },
        opening_steps: Array.isArray(c.voice?.opening_steps) && c.voice.opening_steps.length ? c.voice.opening_steps : def.voice.opening_steps,
      },
      qualification: {
        ...def.qualification, ...c.qualification,
        discovery_slots: c.qualification?.discovery_slots ?? def.qualification.discovery_slots,
        silent_signals: c.qualification?.silent_signals ?? def.qualification.silent_signals,
      },
      boundaries: {
        curadas: { ...def.boundaries.curadas, ...(c.boundaries?.curadas || {}) },
        custom: c.boundaries?.custom || [],
        comportamentos: c.boundaries?.comportamentos || [],
        competitors_to_avoid: c.boundaries?.competitors_to_avoid ?? def.boundaries.competitors_to_avoid,
        regras: Array.isArray(c.boundaries?.regras) && c.boundaries.regras.length
          ? c.boundaries.regras
          : buildRegrasFromLegacy({ ...def.boundaries.curadas, ...(c.boundaries?.curadas || {}) }, c.boundaries?.comportamentos || []),
      },
      capabilities: {
        crm_write: { ...def.capabilities.crm_write, ...(c.capabilities?.crm_write || {}) },
        calendar: (() => {
          const cal = { ...def.capabilities.calendar, ...(c.capabilities?.calendar || {}) }
          // migra config antiga (1 planner) -> closer_ids
          if ((!Array.isArray(cal.closer_ids) || !cal.closer_ids.length) && cal.wedding_planner_profile_id) {
            cal.closer_ids = [cal.wedding_planner_profile_id]
          }
          if (!Array.isArray(cal.closer_ids)) cal.closer_ids = []
          return cal
        })(),
        knowledge: { ...def.capabilities.knowledge, ...(c.capabilities?.knowledge || {}) },
        followup: { ...def.capabilities.followup, ...(c.capabilities?.followup || {}) },
        multimodal: { ...def.capabilities.multimodal, ...(c.capabilities?.multimodal || {}) },
        memory: { ...def.capabilities.memory, ...(c.capabilities?.memory || {}) },
        handoff: { ...def.capabilities.handoff, ...(c.capabilities?.handoff || {}) },
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

// Avisos: rede de segurança do "controle total". Lista o que foi desligado e protege
// qualidade, + o que está incompleto. O gestor decide; aqui só mostramos com clareza.
export interface SofiaWarning { kind: 'risco' | 'incompleto'; text: string }
export function computeSofiaWarnings(cfg: SofiaConfigV2): SofiaWarning[] {
  const w: SofiaWarning[] = []
  const regras = (cfg.boundaries.regras && cfg.boundaries.regras.length)
    ? cfg.boundaries.regras
    : buildRegrasFromLegacy(cfg.boundaries.curadas || {}, cfg.boundaries.comportamentos || [])
  regras.filter(r => r.protege && !r.ativa).forEach(r => {
    w.push({ kind: 'risco', text: `Você desligou uma regra que protege a qualidade: "${r.texto.slice(0, 60)}".` })
  })
  if (cfg.pricing?.can_negotiate) w.push({ kind: 'risco', text: 'A Sofia está autorizada a negociar/dar desconto (o recomendado é desligado).' })
  const mode = cfg.voice.abertura_mode ?? 'literal'
  if (mode !== 'free' && !cfg.voice.abertura?.trim()) w.push({ kind: 'incompleto', text: 'A mensagem de abertura está vazia.' })
  if (!cfg.phases?.length) w.push({ kind: 'incompleto', text: 'Nenhuma etapa no roteiro da conversa.' })
  if (!cfg.qualification.criteria?.length) w.push({ kind: 'incompleto', text: 'Nenhum critério de qualificação.' })
  if (cfg.qualification.scoring_enabled && !(cfg.qualification.criteria || []).some(c => (c.rule_type ?? 'qualifier') === 'qualifier')) {
    w.push({ kind: 'incompleto', text: 'Pontuação ligada, mas nenhum critério que "qualifica" (ninguém vai pontuar).' })
  }
  cfg.moments?.forEach(m => { if (m.enabled !== false && !m.instrucao?.trim()) w.push({ kind: 'incompleto', text: `O momento "${m.label || 'sem nome'}" está sem instrução.` }) })
  if (cfg.capabilities.crm_write.enabled && cfg.capabilities.crm_write.stage_move_enabled && !cfg.capabilities.crm_write.target_stage_id) {
    w.push({ kind: 'incompleto', text: '"Mover etapa" está ligado, mas sem etapa de destino escolhida.' })
  }
  if (cfg.capabilities.calendar.enabled && !(cfg.capabilities.calendar.closer_ids?.length || cfg.capabilities.calendar.wedding_planner_profile_id)) {
    w.push({ kind: 'incompleto', text: 'Agenda ligada, mas sem nenhum closer (Wedding Planner) escolhido.' })
  }
  return w
}

// Prévia TÉCNICA (prompt cru) — reconstrói a estrutura do cérebro com as SUAS configs,
// pra você caçar erro. Os blocos de raciocínio da Camila aparecem marcados como FIXOS.
// É uma reconstrução fiel da estrutura (não a execução ao vivo, que tem o histórico real).
// Blocos FIXOS (o raciocínio da Camila) — texto verbatim do cérebro, mostrado por inteiro
// pra o Vitor caçar erro. NÃO são editáveis (é a inteligência), mas aparecem completos.
const FIXED_OBJETIVO = `Ter uma conversa boa e humana que faça o casal se sentir entendido, entender o que sonham pro casamento, qualificar com leveza (visão, destino/região, nº de convidados, orçamento do casal, data) e, quando fizer sentido, convidar pra uma conversa com a Wedding Planner. Acolhe, entende e abre a porta pra Planner. Não fecha venda nem negocia, mas PODE falar de valor (assessoria e faixas) conforme a política de preço.`
const FIXED_COMO_CONVERSA = `- Soa como pessoa real no WhatsApp: leve, calorosa, curiosa. Frases curtas, "a gente" (nunca "nós"), "vocês". Espelha o jeito deles.\n- Conduz pela curiosidade, não por roteiro. Reage ao que disseram antes de seguir. Às vezes só acolhe; às vezes UMA pergunta aberta. Nunca metralha perguntas.\n- Deixa o casal falar mais que ela. Pergunta de "como"/"o que", nunca "por quê" que soe cobrança.`
const FIXED_MATRIZ = `Decide em silêncio o próximo passo (nunca expõe):\n- Se não sabe o nome: pede de leve.\n- Se falta visão ou destino: UMA pergunta aberta sobre isso.\n- Se tem destino+convidados mas não orçamento: pergunta quanto o CASAL pretende investir.\n- Se tem o essencial + sinal de intenção: costura numa frase, com as palavras deles, e convida pra Planner.\n- Sempre reage ao que disse antes de avançar.`
const FIXED_SPIN = `Lente (NÃO roteiro): situação (realidade do casal) · problema (o que pesa: logística, distância, alinhar família) · implicação (efeito da dificuldade, com leveza) · ganho (valor de ter a Planner ao lado). Usa o que couber; nunca rotula "situação/problema" na fala.`
const FIXED_GATES = `Só convida pra Planner quando TUDO for verdade: sabe o nome · entende destino/região + ideia de convidados + já perguntou o orçamento · há data pretendida ou vontade real. Data definida = sinal forte pra convidar assim que os gates fecharem.`
const FIXED_CONVITE = (inventedDateOn: boolean) => `Quando fizer sentido, convida pra conversa com a Wedding Planner. ${inventedDateOn ? 'Não inventa data nem horário. ' : ''}Pergunta o melhor período, diz que reserva com a Planner e confirma, pede o e-mail só depois que toparem. Handoff invisível: nunca diz "vou te transferir", apenas conduz ("já deixo reservado com a nossa Planner e te confirmo").`
const FIXED_ANTIPADROES = `Evita sempre: justificar a pergunta ("pra eu te ajudar melhor"); inferir causa/sentimento não dito; empilhar perguntas de temas diferentes; prometer o que é da Planner; repetir muleta ("que delícia") em mensagens seguidas; fechamento frouxo ("qualquer coisa estou aqui").`
const FIXED_AUTOCHECAGEM = `Antes de enviar confere em silêncio: reagi ao que disseram? Fiz no máximo 1 pergunta aberta e leve? Respeitei as linhas vermelhas, a política de preço e o glossário? Se 1º contato, abri certo; se os gates fecharam, costurei e convidei? Zero travessão, zero rótulo interno, zero clichê.`
const FIXED_FORMATO = `Devolve só a mensagem que o casal vai ler no WhatsApp: 1 a 3 frases curtas, um objetivo por mensagem. Nunca escreve rótulos internos, nunca explica a estrutura, nunca oferece variações.`

export function assembleSofiaPromptPreview(cfg: SofiaConfigV2): string {
  const v = cfg.voice, id = cfg.identity, b = cfg.boundaries
  const tomMap: Record<string, string> = { acolhedor: 'acolhedor, caloroso e humano', formal: 'profissional e formal', direto: 'direto e objetivo' }
  const fm = typeof v.formalidade === 'number' ? v.formalidade : 0.5
  const formal = fm < 0.34 ? 'bem informal e leve' : fm > 0.66 ? 'mais formal e sóbrio' : 'natural'
  const tomDesc = [(tomMap[v.tom] || v.tom), formal, ...(v.tone_tags ?? [])].filter(Boolean).join(', ')
  const regras = (b.regras && b.regras.length) ? b.regras : buildRegrasFromLegacy(b.curadas || {}, b.comportamentos || [])
  const ativas = regras.filter(r => r.ativa !== false)
  const noInventedDate = ativas.some(r => r.id === 'no_invented_date')
  const slots = cfg.qualification.discovery_slots ?? []
  const prio: Record<string, string> = { critical: 'crítico', preferred: 'importante', nice_to_have: 'extra' }
  const mode = v.abertura_mode ?? 'literal'
  const FIX = (tag: string, body: string) => `<${tag}> [FIXO — raciocínio da Camila]\n${body}\n</${tag}>`
  const out: string[] = []
  out.push('<papel>')
  out.push(`Você é ${id.persona_nome}, ${id.role || 'especialista de casamentos'} da ${id.empresa}, no WhatsApp. Tom: ${tomDesc}.`)
  if (id.proposta) out.push(`Sobre a empresa: ${id.proposta}.`)
  if (id.mission_one_liner) out.push(`Sua missão: ${id.mission_one_liner}.`)
  out.push('</papel>')
  out.push(FIX('objetivo', FIXED_OBJETIVO))
  out.push(FIX('como_voce_conversa', FIXED_COMO_CONVERSA))
  out.push('<fluxo_de_fases>')
  ;(cfg.phases ?? []).forEach((p, i) => out.push(`  ${i + 1}. ${p.nome}: ${p.objetivo}${p.avancar_quando ? ` (avança quando: ${p.avancar_quando})` : ''}`))
  out.push('</fluxo_de_fases>')
  out.push('<o_que_entender>')
  if (slots.length) slots.forEach((s, i) => out.push(`  ${i + 1}. ${s.label} [${prio[s.priority] || 'importante'}]${(s.questions ?? []).filter(Boolean).length ? ` — perguntas: ${(s.questions).filter(Boolean).map(q => `"${q}"`).join(' / ')}` : ' (improvisa)'}`))
  else cfg.qualification.etapas.forEach((e, i) => out.push(`  ${i + 1}. ${e}`))
  if ((cfg.qualification.silent_signals ?? []).length) out.push(`  Percebe sozinha (sem perguntar): ${(cfg.qualification.silent_signals as string[]).join('; ')}.`)
  out.push('</o_que_entender>')
  out.push(FIX('matriz_de_decisao', FIXED_MATRIZ))
  out.push(FIX('spin_framework', FIXED_SPIN))
  out.push(FIX('gates_do_convite', FIXED_GATES))
  out.push(FIX('convite_e_agenda', FIXED_CONVITE(noInventedDate)))
  out.push('<linhas_vermelhas>')
  out.push('  - ORÇAMENTO DO CASAL: pergunte quanto pretendem investir antes de convidar (faixas como opção, sem travar).')
  out.push('  - Pouca intenção (só curiosidade, "daqui muitos anos"): reconhece com carinho, deixa a porta aberta.')
  ativas.forEach(r => out.push(`  - ${r.texto}`))
  if ((b.competitors_to_avoid ?? []).length) out.push(`  - Nunca cita concorrentes: ${(b.competitors_to_avoid as string[]).join(', ')}.`)
  out.push('</linhas_vermelhas>')
  out.push('<politica_preco>')
  if (cfg.pricing.mention_fee) out.push(`  Assessoria: R$ ${cfg.pricing.fee_min_brl} a R$ ${cfg.pricing.fee_max_brl}, conforme escopo.`)
  out.push(`  Quando revelar: ${REVEAL_OPTIONS.find(o => o.value === cfg.pricing.reveal_strategy)?.label}.`)
  out.push(`  ${cfg.pricing.can_negotiate ? 'Pode negociar.' : 'NUNCA negocia.'} Ao hesitar: ${cfg.pricing.tone_on_pushback === 'firm' ? 'firmeza' : 'empatia'}.`)
  ;(cfg.pricing.destination_ranges ?? []).forEach(r => out.push(`  ${r.destino}: ${(r.tiers ?? []).map(t => `${t.convidados} conv. a partir de ${t.a_partir} ${r.moeda}`).join('; ')}`))
  out.push('</politica_preco>')
  out.push('<glossario>')
  if ((v.glossary.marca ?? []).length) out.push(`  Usar: ${v.glossary.marca.join(', ')}`)
  if ((v.glossary.proibida ?? []).length) out.push(`  Evitar: ${v.glossary.proibida.join(', ')}`)
  ;(v.rules ?? []).forEach(r => out.push(`  Regra de tom: ${r}`))
  if ((v.typical_phrases ?? []).length) out.push(`  Frases típicas: ${(v.typical_phrases as string[]).map(f => `"${f}"`).join('; ')}`)
  out.push('</glossario>')
  out.push('<momentos>')
  ;(cfg.moments ?? []).filter(m => m.enabled !== false).forEach(m => out.push(`  - ${m.trigger_type === 'custom_condition' && m.custom_condition_description ? `Quando ${m.custom_condition_description}` : m.label}: ${m.instrucao}`))
  out.push('</momentos>')
  out.push(FIX('antipadroes', FIXED_ANTIPADROES))
  out.push('<primeira_mensagem>')
  out.push(mode === 'free' ? '  Componha sozinha, reconhecendo o que o casal disse + persona/proposta.'
    : mode === 'directive' ? `  Diretriz (reconhece a 1ª msg + cobre): ${v.abertura}`
    : `  Exata: ${v.abertura}`)
  out.push('</primeira_mensagem>')
  out.push(FIX('autochecagem', FIXED_AUTOCHECAGEM))
  out.push(FIX('formato', FIXED_FORMATO))
  return out.join('\n')
}
