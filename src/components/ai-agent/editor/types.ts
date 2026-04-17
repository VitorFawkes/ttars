import type { AgentTipo } from '@/hooks/useAiAgents'

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
  tipo: 'buffer_window' | 'vector'
  session_key_template: string
  window_size: number
}

export interface MultimodalConfig {
  audio: boolean
  image: boolean
  pdf: boolean
}

export interface ContextFieldsConfig {
  visible_fields: string[]
  updatable_fields: string[]
  evidence_level: Record<string, 'low' | 'medium' | 'high'>
}

export interface HandoffSignal {
  slug: string
  enabled: boolean
  description: string
}

export interface HandoffActions {
  change_stage_id: string | null
  apply_tag: { color: string; name: string } | null
  notify_responsible: boolean
  transition_message: string | null
  pause_permanently: boolean
}

export interface IntelligentDecision {
  enabled: boolean
  config: Record<string, unknown>
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
  context_fields_config: ContextFieldsConfig
  multimodal_config: MultimodalConfig

  handoff_signals: HandoffSignal[]
  handoff_actions: HandoffActions
  intelligent_decisions: Record<string, IntelligentDecision>
  validator_rules: ValidatorRule[]

  routing_keywords: string
  escalation_message: string
  escalation_turn_limit: number
  fallback_message: string
  n8n_webhook_url: string

  interaction_mode: InteractionMode
  first_message_config: FirstMessageConfig
  outbound_trigger_config: OutboundTriggerConfig
}

export const HANDOFF_SIGNALS_CATALOG: Array<{ slug: string; label: string; defaultDescription: string }> = [
  { slug: 'cliente_insatisfeito', label: 'Cliente insatisfeito', defaultDescription: 'Tom frustrado, críticas repetidas, ironia evidente ao longo da conversa.' },
  { slug: 'pedido_humano', label: 'Pedido explícito por humano', defaultDescription: 'Cliente sinaliza em qualquer linguagem que quer falar com outra pessoa.' },
  { slug: 'fora_escopo', label: 'Situação fora do escopo', defaultDescription: 'Tema que o agente não domina (ex: jurídico, cancelamento complexo, reembolso).' },
  { slug: 'informacao_sensivel', label: 'Informação sensível/crítica', defaultDescription: 'Cobrança errada, dado pessoal comprometido, risco reputacional.' },
  { slug: 'loop_incompreensao', label: 'Loop de incompreensão', defaultDescription: 'Agente já tentou múltiplas vezes e o cliente não avançou.' },
  { slug: 'regulatorio', label: 'Assunto regulatório', defaultDescription: 'Tema que exige humano por política (devolução, cancelamento de contrato).' },
  { slug: 'alta_intencao_bloqueada', label: 'Alta intenção de compra bloqueada', defaultDescription: 'Cliente próximo de fechar mas o agente não consegue avançar sozinho.' },
  { slug: 'conversa_longa', label: 'Tempo de conversa estourado', defaultDescription: 'Conversa muito longa sem resolução clara.' },
]

export const INTELLIGENT_DECISIONS_CATALOG: Array<{ key: string; label: string; description: string }> = [
  { key: 'criar_reuniao', label: 'Quando criar reunião', description: 'Agente decide quando marcar reunião. Pré-requisitos configuráveis.' },
  { key: 'atualizar_contato', label: 'Quando atualizar contato', description: 'Atualiza dado novo com evidência clara.' },
  { key: 'aplicar_tag', label: 'Quando aplicar tag', description: 'Aplica tags em cards com base em sinais da conversa.' },
  { key: 'buscar_kb', label: 'Quando buscar na Knowledge Base', description: 'Consulta a base de conhecimento para responder fatos específicos.' },
  { key: 'pedir_contexto', label: 'Pedir contexto vs responder', description: 'Decide se arrisca uma resposta ou pede mais informação.' },
  { key: 'ajuste_tom', label: 'Ajuste de tom em tempo real', description: 'Adapta o tom ao humor do cliente.' },
  { key: 'consolidar_resumo', label: 'Consolidar resumo do card', description: 'Atualiza o resumo do card quando há fato novo relevante.' },
  { key: 'reapresentacao', label: 'Re-apresentação', description: 'Decide quando voltar a se apresentar.' },
  { key: 'escalar_agente_ia', label: 'Escalar para outro agente IA', description: 'Encaminha para outro agente da conta quando o tema é dele.' },
]

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
  tipo: 'buffer_window',
  session_key_template: '{{telefone}}|{{card_id}}',
  window_size: 20,
}

export const DEFAULT_MULTIMODAL: MultimodalConfig = {
  audio: true,
  image: true,
  pdf: false,
}

export const DEFAULT_CONTEXT_FIELDS: ContextFieldsConfig = {
  visible_fields: ['nome', 'telefone', 'email', 'produto', 'etapa', 'ai_resumo', 'ai_contexto'],
  updatable_fields: ['email', 'cidade', 'empresa'],
  evidence_level: {},
}

export const DEFAULT_HANDOFF_ACTIONS: HandoffActions = {
  change_stage_id: null,
  apply_tag: null,
  notify_responsible: true,
  transition_message: null,
  pause_permanently: false,
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
