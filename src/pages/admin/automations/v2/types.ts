/**
 * Types compartilhados pelo editor visual de automações (v2).
 *
 * O canvas é um DAG: 1 node de Trigger (raiz) + N nodes de Action conectados
 * por edges. Persiste em cadence_templates + cadence_steps (action nodes) +
 * cadence_event_triggers (trigger node). Sem novas tabelas.
 */
import type { Node, Edge } from '@xyflow/react'

// ----------------------------------------------------------------------------
// Categorias de node — usadas pra agrupar no Toolbox
// ----------------------------------------------------------------------------
export type NodeCategory =
    | 'trigger'      // só pode haver 1 por workflow; sempre o ponto de partida
    | 'card'         // ações sobre o card (create_task, change_stage, ...)
    | 'message'      // envio de mensagem/mídia via Echo
    | 'echo'         // gestão de conversa Echo (assign, close, tag, ...)
    | 'flow'         // wait, branch, end, start_cadence
    | 'integration'  // trigger_n8n_webhook etc.

// ----------------------------------------------------------------------------
// Tipos de node — bate 1:1 com event_type (triggers) ou action_type/step_type
// (ações). O componente visual é resolvido em nodes/index.ts pelo `type`.
// ----------------------------------------------------------------------------
export type TriggerNodeType =
    | 'trigger.card_created'
    | 'trigger.stage_enter'
    | 'trigger.macro_stage_enter'
    | 'trigger.field_changed'
    | 'trigger.tag_added'
    | 'trigger.tag_removed'
    | 'trigger.inbound_message_pattern'
    | 'trigger.time_offset_from_date'
    | 'trigger.time_in_stage'
    | 'trigger.calendly_invitee_created'

export type ActionNodeType =
    // card
    | 'action.create_task'
    | 'action.complete_task'
    | 'action.change_stage'
    | 'action.add_tag'
    | 'action.remove_tag'
    | 'action.update_field'
    | 'action.update_contact_field'
    | 'action.assign_owner'
    | 'action.notify_internal'
    // message
    | 'action.send_message'
    | 'action.send_media'
    | 'action.send_email'
    // echo
    | 'action.echo_assign'
    | 'action.echo_release'
    | 'action.echo_close'
    | 'action.echo_set_status'
    | 'action.echo_add_tag'
    | 'action.echo_remove_tag'
    | 'action.echo_add_co_owner'
    | 'action.echo_remove_co_owner'
    // flow
    | 'action.wait'
    | 'action.branch'
    | 'action.end'
    | 'action.start_cadence'
    // integration
    | 'action.trigger_n8n_webhook'

export type WorkflowNodeType = TriggerNodeType | ActionNodeType

// ----------------------------------------------------------------------------
// Metadata visual de cada tipo (label, descrição, categoria, ícone)
// ----------------------------------------------------------------------------
export interface NodeTypeMeta {
    type: WorkflowNodeType
    label: string
    description: string
    category: NodeCategory
    /** Importado de lucide-react no componente que renderiza */
    iconName: string
    /** Quando setado, sobrescreve o iconName e renderiza esta imagem (ex: logo de provider externo) */
    imageUrl?: string
    /** Se true, é o ponto de partida (só 1 por workflow) */
    isTrigger: boolean
    /** Se true, não tem saída (ex: end). Padrão: false */
    isTerminal?: boolean
    /** Se true, tem N saídas em vez de 1 (ex: branch). Padrão: false */
    hasMultipleOutputs?: boolean
}

// ----------------------------------------------------------------------------
// Dados que cada node carrega no React Flow node.data
// ----------------------------------------------------------------------------
export interface WorkflowNodeData extends Record<string, unknown> {
    /** Nome amigável editável pelo usuário */
    label: string
    /** Config persistida (mapeada pra task_config / message_config / etc no save) */
    config: Record<string, unknown>
    /** Status de validação calculado (preenchido?) — pode ficar vazio até o user mexer */
    valid?: boolean
    /** Mensagem de erro de validação, se houver */
    error?: string | null
}

export type WorkflowNode = Node<WorkflowNodeData, WorkflowNodeType>
export type WorkflowEdge = Edge

// ----------------------------------------------------------------------------
// Estado serializável do workflow inteiro (canvas → save)
// ----------------------------------------------------------------------------
export interface WorkflowSnapshot {
    template_id: string | null
    name: string
    description: string
    is_active: boolean
    auto_cancel_on_stage_change: boolean
    respect_business_hours: boolean
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
}
