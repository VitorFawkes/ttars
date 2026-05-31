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

export interface SofiaConfigV2 {
  config_version: number
  identity: { persona_nome: string; empresa: string; proposta: string }
  voice: { tom: Tom; formalidade: number; abertura: string }
  qualification: {
    etapas: string[]
    faixas_orcamento: string[]
    gates: Record<string, unknown>
  }
  boundaries: { curadas: Record<string, boolean>; custom: string[] }
  capabilities: SofiaCapabilities
  pricing: SofiaPricing
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

// Linhas vermelhas curadas (decisões de marca). O texto da regra é fixo no código;
// o admin só liga/desliga. As 3 primeiras vêm ligadas por padrão (e batem com o cérebro).
export interface CuratedBoundary {
  key: string
  label: string
  hint: string
  defaultOn: boolean
}
export const CURATED_BOUNDARIES: CuratedBoundary[] = [
  { key: 'no_price', label: 'Nunca dar preço fechado', hint: 'Remete sempre à Wedding Planner. Só usa faixas pra perguntar o orçamento do casal.', defaultOn: true },
  { key: 'no_invented_date', label: 'Nunca inventar data ou horário', hint: 'Pergunta o melhor período e diz que reserva com a Planner.', defaultOn: true },
  { key: 'no_cliche', label: 'Nunca usar clichê', hint: '"casamento dos sonhos", "experiência premium", "pode deixar com a gente"…', defaultOn: true },
  { key: 'no_dash', label: 'Nunca usar travessão', hint: 'Usa vírgula, ponto ou reticências. Garantido também por uma trava automática.', defaultOn: true },
  { key: 'no_first_emoji', label: 'Sem emoji na 1ª mensagem', hint: 'Depois no máximo um, e só se o casal usar primeiro.', defaultOn: true },
  { key: 'no_ai_mention', label: 'Nunca dizer que é uma IA', hint: 'Atende como uma pessoa do time.', defaultOn: false },
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
    config_version: 2,
    identity: {
      persona_nome: 'Sofia',
      empresa: 'Welcome Weddings',
      proposta: 'a gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina',
    },
    voice: {
      tom: 'acolhedor',
      formalidade: 0.5,
      abertura: 'Oi! Aqui é a Sofia, da Welcome Weddings, tudo bem? Como é o nome de vocês? A gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina. A ideia aqui é uma conversa rápida pra eu entender o que vocês esperam, tirar dúvidas e, se fizer sentido, marcar um papo com a nossa Wedding Planner. Pra começar: o que é o casamento pra vocês, e como vocês imaginam ele?',
    },
    qualification: {
      etapas: [
        'O que é o casamento pra vocês e como imaginam ele',
        'Destino ou região',
        'Número de convidados (estimado)',
        'Faixa de investimento / orçamento',
      ],
      faixas_orcamento: ['R$ 80 a 150 mil', 'R$ 150 a 250 mil', 'R$ 250 a 400 mil', 'R$ 400 mil ou mais'],
      gates: {},
    },
    boundaries: { curadas, custom: [] },
    capabilities: {
      crm_write: { enabled: false, writable_fields: [], protected_fields: [], stage_move_enabled: false, target_stage_id: null },
      calendar: { enabled: false, wedding_planner_profile_id: null, windows: [], slot_duration_minutes: 45, skip_weekends: true, max_slots: 4, search_window_days: 14 },
      knowledge: { enabled: false, top_k: 4, faqs: [] },
      followup: { enabled: false, default_time: '10:30', days: [1, 3, 7] },
      multimodal: { enabled: false, audio: true, image: true, pdf: true },
      memory: { enabled: false, window_messages: 10, debounce_ms: 8000, bubbles_enabled: true, bubble_delay_ms: 1500 },
    },
    pricing: defaultPricing(),
  }
}

// Migra um config possivelmente antigo (flat v1) para a forma v2, sem perder dados.
export function normalizeToV2(raw: unknown): SofiaConfigV2 {
  const def = defaultSofiaConfig()
  if (!raw || typeof raw !== 'object') return def
  const c = raw as Record<string, any>
  if ((c.config_version === 2 || c.config_version === 3) && c.identity && c.capabilities) {
    // mescla com defaults pra garantir todas as chaves (v2 e v3)
    return {
      ...def,
      ...c,
      identity: { ...def.identity, ...c.identity },
      voice: { ...def.voice, ...c.voice },
      qualification: { ...def.qualification, ...c.qualification },
      boundaries: { curadas: { ...def.boundaries.curadas, ...(c.boundaries?.curadas || {}) }, custom: c.boundaries?.custom || [] },
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
  // v1 flat -> v2
  return {
    ...def,
    identity: { persona_nome: c.persona_nome || def.identity.persona_nome, empresa: c.empresa || def.identity.empresa, proposta: c.proposta || def.identity.proposta },
    voice: { tom: (c.tom as Tom) || def.voice.tom, formalidade: def.voice.formalidade, abertura: c.abertura || def.voice.abertura },
    qualification: { etapas: c.etapas || def.qualification.etapas, faixas_orcamento: c.faixas_orcamento || def.qualification.faixas_orcamento, gates: {} },
    boundaries: { curadas: def.boundaries.curadas, custom: c.fronteiras || [] },
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
