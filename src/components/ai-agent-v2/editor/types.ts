import type { AgentTipo } from '@/hooks/v2/useAiAgents'

export interface AgentTimings {
  debounce_seconds: number
  typing_delay_seconds: number
  max_message_blocks: number
}

export interface PipelineModelConfig {
  model: string
  temperature: number
  max_tokens: number
}

export type PipelineModelKey = 'main' | 'formatter' | 'validator' | 'context' | 'data'

export interface MemoryConfig {
  // Campos efetivamente consumidos pelo ai-agent-router (linhas 754-755 do router).
  max_history_turns?: number
  short_term_turns?: number
  // Campos legacy mantidos só para não quebrar writes de registros antigos.
  tipo?: 'buffer_window' | 'vector'
  session_key_template?: string
  window_size?: number
}

export interface MultimodalConfig {
  audio: boolean
  image: boolean
  pdf: boolean
}

/**
 * Configuração de agendamento automático de reunião com closer/especialista
 * quando o agente identifica lead qualificado.
 */
export interface BookMeetingConfig {
  /** Ativa o agendamento automático. */
  enabled: boolean
  /** ID do profile que recebe a reunião (Wedding Planner / closer). */
  responsavel_id: string | null
  /** Tipo de reunião que vai ser registrada na tabela tarefas. */
  tipo: 'reuniao' | 'reuniao_video' | 'reuniao_presencial' | 'reuniao_telefone'
  /** Duração esperada em minutos (vai pro metadata da tarefa). */
  duracao_minutos: number
  /** Template do título. Aceita {contact_name}, {agent_name}, {responsavel_name}. */
  titulo_template: string
  /** Mensagem que a agente envia pro lead após agendar. Mesmas variáveis + {data} {hora}. */
  mensagem_confirmacao_template: string
  /**
   * Janela de slots oferecidos ao lead. Quando ausente, usa defaults seguros
   * (skip_today=true, business_days_ahead=6, slots_per_day=2, min_hours_between_slots=2).
   * Adicionado 07/05/2026 — admin pode ajustar pela UI sem precisar de deploy.
   */
  scheduling?: {
    /** true = não oferece reunião pra hoje (começa do próximo dia útil). */
    skip_today?: boolean
    /** Quantos dias úteis à frente oferecer slots. Default 6. */
    business_days_ahead?: number
    /** Quantos horários por dia oferecer no máximo. Default 2. */
    slots_per_day?: number
    /** Espaçamento mínimo (em horas) entre os horários do mesmo dia. Default 2. */
    min_hours_between_slots?: number
  } | null
}

export interface AutoHandoffInvisibleConfig {
  /** Quando ligado, dispara handoff invisível quando validator bloqueia N+ mensagens nos últimos M turnos. */
  enabled: boolean
  /** Quantos bloqueios do validador disparam o handoff. Default 3. */
  block_threshold: number
  /** Janela de turnos olhada pra contar bloqueios. Default 5. */
  window_turns: number
}

export interface HandoffActions {
  change_stage_id: string | null
  apply_tag: { color: string; name: string } | null
  notify_responsible: boolean
  transition_message: string | null
  pause_permanently: boolean
  /** Agendamento automático de reunião com closer (opcional). */
  book_meeting: BookMeetingConfig | null
  /** Auto-handoff invisível por bloqueios consecutivos do validador. */
  auto_handoff_invisible?: AutoHandoffInvisibleConfig | null
}

export interface ValidatorRule {
  id: string
  condition: string
  action: 'block' | 'correct' | 'ignore'
  enabled: boolean
}

export interface AgentPrompts {
  main: string
  context: string
  data_update: string
  formatting: string
  validator: string
}

export type InteractionMode = 'inbound' | 'outbound' | 'hybrid'

export interface FirstMessageConfig {
  type: 'fixed' | 'ai_generated'
  fixed_template: string
  ai_instructions: string
  delay_seconds: number
}

export interface OutboundTrigger {
  type: 'card_created' | 'stage_changed' | 'idle_days'
  conditions: Record<string, unknown>
  enabled: boolean
}

export interface BusinessHoursConfig {
  start: string
  end: string
  timezone: string
  days: string[]
}

export interface OutboundTriggerConfig {
  triggers: OutboundTrigger[]
  business_hours: BusinessHoursConfig
  max_daily_outbound: number
  max_outbound_per_contact?: number
}

/**
 * Janela contínua de atendimento (modelo de calendário). Múltiplas janelas
 * cobrem intervalos (ex: manhã 9-12 + tarde 14-18 com almoço entre).
 */
export interface SchedulingWindow {
  from: string  // "HH:MM"
  to: string    // "HH:MM"
}

/**
 * Configuração de oferta de horários no desfecho_qualificado.
 * Lida pelo router (ai-agent-router-v2) ao montar `proposed_slots` e pela
 * tool `check_calendar`. NULL no banco = defaults seguros.
 *
 * Modelos de horários (prioridade):
 *   1. `available_windows` + `slot_duration_minutes` (janelas com step)
 *   2. `available_hours` (lista discreta) — fallback legado
 */
export interface SchedulingConfig {
  /** Janelas de atendimento (modelo padrão). Vazio = usa available_hours. */
  available_windows: SchedulingWindow[]
  /** Step entre slots em minutos. Default 60. */
  slot_duration_minutes: number
  /** Lista discreta de horários (legado). Ignorado quando windows preenchidas. */
  available_hours: string[]
  /** Até quantos horários do MESMO dia oferecer ao casal. */
  max_slots_per_day: number
  /** Quantos dias distintos cobrir nos slots oferecidos. */
  max_days: number
  /** Cap total de slots a oferecer numa única mensagem. */
  total_slots: number
  /** true = pula sábado e domingo na busca de horários disponíveis. */
  skip_weekends: boolean
  /** Janela máxima (em dias) que o router busca slots à frente de hoje. */
  search_window_days: number
  /** "short" = "14/05" | "full" = "14/05/2026". */
  date_format: 'short' | 'full'
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  available_windows: [
    { from: '09:00', to: '12:00' },
    { from: '14:00', to: '18:00' },
  ],
  slot_duration_minutes: 60,
  available_hours: [],
  max_slots_per_day: 3,
  max_days: 2,
  total_slots: 6,
  skip_weekends: true,
  search_window_days: 14,
  date_format: 'short',
}

export interface AgentEditorForm {
  nome: string
  descricao: string
  persona: string
  tipo: AgentTipo
  ativa: boolean
  execution_backend: 'edge_function' | 'n8n' | 'external_webhook'

  system_prompt: string
  prompts_extra: Omit<AgentPrompts, 'main'>

  modelo: string
  temperature: number
  max_tokens: number
  pipeline_models: Record<PipelineModelKey, PipelineModelConfig>
  timings: AgentTimings

  assigned_skill_ids: string[]
  skill_config_overrides: Record<string, Record<string, unknown>>

  memory_config: MemoryConfig
  multimodal_config: MultimodalConfig

  handoff_actions: HandoffActions
  validator_rules: ValidatorRule[]

  routing_keywords: string
  escalation_message: string
  escalation_turn_limit: number
  fallback_message: string
  n8n_webhook_url: string

  interaction_mode: InteractionMode
  first_message_config: FirstMessageConfig
  outbound_trigger_config: OutboundTriggerConfig

  // Playbook v2 (Marco 3) — feature flag por agente
  playbook_enabled: boolean

  /**
   * Profile da Wedding Planner (ou T.Planner) responsável. Quando setado,
   * o router filtra a agenda apenas pelas reuniões dessa pessoa e usa esse
   * profile como responsavel_id ao criar reunião via confirm_meeting_slot.
   * null = comportamento legado (lê reuniões da org inteira).
   */
  wedding_planner_profile_id: string | null

  /**
   * Configuração de oferta de horários no desfecho qualificado.
   * null = defaults seguros (3 dias × 1 horário, formato curto).
   */
  scheduling_config: SchedulingConfig | null

  /**
   * Override per-agente das descrições das tools built-in que vão pro prompt.
   * Chave = nome da tool (ex "request_handoff"). Valor = texto que substitui
   * o default hardcoded no router. Chave ausente = usa default.
   * Vazio {} = todas as tools usam default.
   */
  tool_descriptions: Record<string, string>
}

export const DEFAULT_TIMINGS: AgentTimings = {
  debounce_seconds: 20,
  typing_delay_seconds: 4,
  max_message_blocks: 3,
}

export const DEFAULT_PIPELINE_MODELS: Record<PipelineModelKey, PipelineModelConfig> = {
  main: { model: 'gpt-5.1', temperature: 0.7, max_tokens: 1024 },
  formatter: { model: 'gpt-5-mini', temperature: 0.3, max_tokens: 1024 },
  validator: { model: 'gpt-5.1', temperature: 0.2, max_tokens: 512 },
  context: { model: 'gpt-5.1', temperature: 0.3, max_tokens: 1024 },
  data: { model: 'gpt-5.1', temperature: 0.2, max_tokens: 512 },
}

export const DEFAULT_MEMORY: MemoryConfig = {
  max_history_turns: 30,
  short_term_turns: 10,
}

export const DEFAULT_MULTIMODAL: MultimodalConfig = {
  audio: true,
  image: true,
  pdf: false,
}

export const DEFAULT_AUTO_HANDOFF_INVISIBLE: AutoHandoffInvisibleConfig = {
  enabled: true,
  block_threshold: 3,
  window_turns: 5,
}

export const DEFAULT_HANDOFF_ACTIONS: HandoffActions = {
  change_stage_id: null,
  apply_tag: null,
  notify_responsible: true,
  transition_message: null,
  pause_permanently: false,
  book_meeting: null,
  auto_handoff_invisible: DEFAULT_AUTO_HANDOFF_INVISIBLE,
}

export const DEFAULT_PROMPTS_EXTRA: Omit<AgentPrompts, 'main'> = {
  context: '',
  data_update: '',
  formatting: '',
  validator: '',
}

export const DEFAULT_FIRST_MESSAGE: FirstMessageConfig = {
  type: 'fixed',
  fixed_template: 'Olá {{contato.nome}}! Sou {{agente.nome}}, tudo bem por aí?',
  ai_instructions: '',
  delay_seconds: 0,
}

export const DEFAULT_OUTBOUND_TRIGGER: OutboundTriggerConfig = {
  triggers: [],
  business_hours: {
    start: '09:00',
    end: '18:00',
    timezone: 'America/Sao_Paulo',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
  max_daily_outbound: 50,
  max_outbound_per_contact: 3,
}

export const MODELO_OPTIONS = [
  { value: 'gpt-5.1', label: 'GPT-5.1 (Recomendado)' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (Rápido/Barato)' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
]

export const PROMPT_VARIABLES: Array<{ label: string; token: string; description: string }> = [
  { label: 'Nome do contato', token: '{{contato.nome}}', description: 'Primeiro nome do contato' },
  { label: 'Telefone', token: '{{contato.telefone}}', description: 'Telefone do contato' },
  { label: 'Email', token: '{{contato.email}}', description: 'Email do contato' },
  { label: 'Produto do card', token: '{{card.produto}}', description: 'TRIPS / WEDDING / etc' },
  { label: 'Etapa atual', token: '{{card.etapa}}', description: 'Nome da etapa atual no pipeline' },
  { label: 'Título do card', token: '{{card.titulo}}', description: 'Título visível no kanban' },
  { label: 'Resumo da conversa', token: '{{card.ai_resumo}}', description: 'Resumo gerado pelo agente anteriormente' },
  { label: 'Histórico', token: '{{historico}}', description: 'Histórico da conversa formatado' },
  { label: 'Data atual', token: '{{data_atual}}', description: 'Data de hoje' },
]
