/**
 * Receitas de automação — presets que cobrem 90% dos cenários reais.
 *
 * Cada receita pré-preenche o builder: event_type, filtros e action_type/config.
 * O gestor só ajusta o texto da mensagem / stage alvo / detalhes da tarefa e ativa.
 *
 * Expandir aqui quando um vendedor/planner pedir caso novo.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles,
  Target,
  Layers,
  MessageCircle,
} from 'lucide-react'

export type ActionType =
  | 'send_message'
  | 'create_task'
  | 'change_stage'
  | 'start_cadence'
  | 'add_tag'
  | 'remove_tag'
  | 'notify_internal'
  | 'update_field'
  | 'trigger_n8n_webhook'

/**
 * Whitelist de campos do card que automações podem atualizar via `update_field`.
 * Mantém em sincronia com UPDATE_FIELD_WHITELIST do cadence-engine.
 */
export const UPDATE_FIELD_OPTIONS: Array<{
  key: string
  label: string
  type: 'string' | 'number' | 'boolean'
  options?: string[]
}> = [
  { key: 'status_comercial', label: 'Status comercial', type: 'string' },
  { key: 'prioridade', label: 'Prioridade', type: 'string', options: ['baixa', 'media', 'alta'] },
  { key: 'valor_estimado', label: 'Valor estimado', type: 'number' },
  { key: 'valor_final', label: 'Valor final (fechado)', type: 'number' },
  { key: 'pronto_para_contrato', label: 'Pronto para contrato', type: 'boolean' },
  { key: 'pronto_para_erp', label: 'Pronto para ERP', type: 'boolean' },
  { key: 'cliente_recorrente', label: 'Cliente recorrente', type: 'boolean' },
  { key: 'condicoes_pagamento', label: 'Condições de pagamento', type: 'string' },
  { key: 'forma_pagamento', label: 'Forma de pagamento', type: 'string' },
  { key: 'estado_operacional', label: 'Estado operacional', type: 'string' },
  { key: 'codigo_cliente_erp', label: 'Código cliente ERP', type: 'string' },
  { key: 'codigo_projeto_erp', label: 'Código projeto ERP', type: 'string' },
  { key: 'taxa_status', label: 'Status da taxa', type: 'string' },
  { key: 'moeda', label: 'Moeda', type: 'string' },
]

export type EventType =
  | 'card_created'
  | 'stage_enter'
  | 'macro_stage_enter'
  | 'field_changed'
  | 'tag_added'
  | 'tag_removed'
  | 'inbound_message_pattern'
  | 'cron_roteamento'

/**
 * Modos de matching para gatilho `inbound_message_pattern`.
 * Mantém em sincronia com o matcher em supabase/functions/ai-agent-router/index.ts.
 */
export type InboundMatchMode = 'contains' | 'starts_with' | 'equals' | 'regex'

export const INBOUND_MATCH_MODE_OPTIONS: Array<{ value: InboundMatchMode; label: string; help: string }> = [
  { value: 'contains', label: 'Contém', help: 'Texto da mensagem inclui o trecho informado.' },
  { value: 'starts_with', label: 'Começa com', help: 'Mensagem começa pelo trecho (ignora espaços iniciais).' },
  { value: 'equals', label: 'É igual a', help: 'Mensagem inteira é exatamente igual ao trecho.' },
  { value: 'regex', label: 'Expressão regular', help: 'Padrão regex (avançado). Ex: cancela|desisto' },
]

/**
 * Whitelist de campos do card que podem disparar `field_changed`.
 * Mantém em sincronia com a whitelist do DB trigger
 * `process_cadence_entry_on_card_field_change`.
 */
export const FIELD_CHANGED_OPTIONS: Array<{
  key: string
  label: string
  description?: string
  allowedToValues?: Array<{ value: string; label: string }>
}> = [
  {
    key: 'status_comercial',
    label: 'Status comercial',
    allowedToValues: [
      { value: 'ganho', label: 'Virou ganho' },
      { value: 'perdido', label: 'Virou perdido' },
      { value: 'aberto', label: 'Voltou a aberto' },
    ],
  },
  { key: 'valor_final', label: 'Valor final (fechado)' },
  { key: 'valor_estimado', label: 'Valor estimado' },
  { key: 'dono_atual_id', label: 'Dono do card' },
  {
    key: 'prioridade',
    label: 'Prioridade',
    allowedToValues: [
      { value: 'baixa', label: 'Virou baixa' },
      { value: 'media', label: 'Virou média' },
      { value: 'alta', label: 'Virou alta' },
    ],
  },
  {
    key: 'pronto_para_contrato',
    label: 'Pronto para contrato',
    allowedToValues: [
      { value: 'true', label: 'Marcado como pronto' },
      { value: 'false', label: 'Desmarcado' },
    ],
  },
  { key: 'taxa_status', label: 'Status da taxa' },
  { key: 'data_viagem_inicio', label: 'Data da viagem' },
]

/**
 * Gatilhos "proativos" disparam SEM o cliente ter mandado mensagem recente.
 * Nesses casos, texto livre cai fora da janela 24h do WhatsApp e é dropado
 * silenciosamente (erro Meta 131047 "Re-engagement"). Só HSM aprovado entrega.
 * O builder obriga HSM nesses gatilhos.
 */
export const PROACTIVE_EVENTS: Set<EventType> = new Set([
  'card_created',
])

export function isProactiveEvent(event: EventType): boolean {
  return PROACTIVE_EVENTS.has(event)
}

export interface RecipePreset {
  id: string
  /** Label curta do cartão */
  name: string
  /** Categoria pra agrupar na galeria */
  category: 'mensagem' | 'tarefa' | 'pipeline' | 'cadencia'
  /** Frase em linguagem humana que descreve o que a automação faz */
  summary: string
  /** Ícone pintado pelo tipo */
  icon: LucideIcon
  /** Produto sugerido (null = qualquer) */
  product?: 'TRIPS' | 'WEDDING' | null
  /** Pré-preenchimento — o usuário ajusta depois */
  preset: {
    event_type: EventType
    /** Config adicional do evento (ex: pattern e match_mode pra inbound_message_pattern) */
    event_config?: Record<string, unknown>
    action_type: ActionType
    action_config?: Record<string, unknown>
    /** Texto sugerido se action_type=send_message (usado apenas se não houver HSM) */
    suggested_message?: string
    /**
     * Sugestão de HSM Template para gatilhos proativos. Se presente, o builder
     * abre com "modo HSM" selecionado e esse template default. Nome deve bater
     * com algum template aprovado no WABA (ver useWhatsAppTemplates).
     */
    suggested_hsm_template?: string
    /** Sugestão de título pra create_task */
    suggested_task_title?: string
  }
}

export const RECIPES: RecipePreset[] = [
  // ─── MENSAGEM ───────────────────────────────────────────────────────
  {
    id: 'boas_vindas_card_criado',
    name: 'Boas-vindas ao novo lead',
    category: 'mensagem',
    summary: 'Quando um card é criado, envia mensagem de boas-vindas para o contato.',
    icon: Sparkles,
    preset: {
      event_type: 'card_created',
      action_type: 'send_message',
      suggested_hsm_template: 'wt_primeiro_contato001',
    },
  },

  // ─── PIPELINE ────────────────────────────────────────────────────────
  {
    id: 'mover_quando_taxa_paga',
    name: 'Mover de etapa automaticamente',
    category: 'pipeline',
    summary: 'Quando um card entra na etapa X, move para a etapa Y após delay.',
    icon: Target,
    preset: {
      event_type: 'stage_enter',
      action_type: 'change_stage',
      action_config: { target_stage_id: null },
    },
  },

  // ─── CADÊNCIA ────────────────────────────────────────────────────────
  {
    id: 'cadencia_prospeccao',
    name: 'Cadência de prospecção',
    category: 'cadencia',
    summary: 'Quando o card entra em Leads, dispara cadência de prospecção SDR.',
    icon: Layers,
    preset: {
      event_type: 'card_created',
      action_type: 'start_cadence',
      action_config: { target_template_id: null },
    },
  },

  // ─── INBOUND MESSAGE PATTERN ─────────────────────────────────────────
  {
    id: 'inbound_cancelar_avisa_dono',
    name: 'Cliente disse "cancelar" → avisa dono',
    category: 'tarefa',
    summary: 'Se o cliente mandar uma mensagem com palavra de cancelamento, dispara notificação interna pro dono do card antes do agente IA responder.',
    icon: MessageCircle,
    preset: {
      event_type: 'inbound_message_pattern',
      event_config: {
        pattern: 'cancelar|desistir|nao quero mais|não quero mais',
        match_mode: 'regex',
        case_sensitive: false,
        skip_ai: true,
      },
      action_type: 'notify_internal',
      action_config: {
        recipient_mode: 'card_owner',
        title: 'Cliente sinalizou cancelamento',
        body: 'O cliente do card {{card.titulo}} mandou uma mensagem indicando cancelamento. Confere antes que o agente IA responda.',
      },
    },
  },
]

export const RECIPE_CATEGORIES: Array<{ key: RecipePreset['category']; label: string; description: string }> = [
  {
    key: 'mensagem',
    label: 'Mensagem',
    description: 'Disparar WhatsApp automático para o cliente',
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    description: 'Mover card de etapa automaticamente',
  },
  {
    key: 'tarefa',
    label: 'Tarefa',
    description: 'Criar tarefa para alguém do time',
  },
  {
    key: 'cadencia',
    label: 'Cadência',
    description: 'Série encadeada de tarefas ao longo do tempo',
  },
]

export function getRecipe(id: string): RecipePreset | undefined {
  return RECIPES.find((r) => r.id === id)
}

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  send_message: 'Enviar mensagem',
  create_task: 'Criar tarefa',
  change_stage: 'Mudar etapa',
  start_cadence: 'Iniciar cadência',
  add_tag: 'Adicionar tag ao card',
  remove_tag: 'Remover tag do card',
  notify_internal: 'Avisar alguém do time',
  update_field: 'Atualizar campo do card',
  trigger_n8n_webhook: 'Disparar webhook (n8n)',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  card_created: 'Card criado',
  stage_enter: 'Card entrou em etapa',
  macro_stage_enter: 'Card entrou em fase',
  field_changed: 'Campo do card mudou',
  tag_added: 'Tag adicionada ao card',
  tag_removed: 'Tag removida do card',
  inbound_message_pattern: 'Cliente respondeu com palavra-chave',
  cron_roteamento: 'Roteamento automático diário',
}
