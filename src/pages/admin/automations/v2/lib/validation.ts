/**
 * Validação visual do workflow.
 *
 * Para cada node, retorna `{ valid, error }` baseado nos campos obrigatórios
 * do tipo. O Canvas re-renderiza nodes com borda vermelha quando inválidos.
 *
 * Validação completa antes do save fica em persistence.ts (saveWorkflow);
 * isso aqui é só feedback enquanto o user edita.
 */
import type { WorkflowNode, WorkflowNodeType } from '../types'

export interface NodeValidation {
    valid: boolean
    error: string | null
}

const requireKey = (cfg: Record<string, unknown>, key: string): string | null => {
    const v = cfg[key]
    if (v === undefined || v === null || v === '') return `Campo "${key}" obrigatório`
    return null
}

const requireArrayNonEmpty = (cfg: Record<string, unknown>, key: string): string | null => {
    const v = cfg[key]
    if (!Array.isArray(v) || v.length === 0) return `Selecione ao menos 1 item em "${key}"`
    return null
}

export function validateNode(type: WorkflowNodeType, config: Record<string, unknown>): NodeValidation {
    let error: string | null = null

    switch (type) {
        case 'trigger.card_created':
            // Sem obrigatório
            break
        case 'trigger.stage_enter':
            error = requireArrayNonEmpty(config, 'applicable_stage_ids')
            break
        case 'trigger.macro_stage_enter':
            error = requireKey(config, 'phase_id')
            break
        case 'trigger.field_changed':
            error = requireKey(config, 'field')
            break
        case 'trigger.tag_added':
        case 'trigger.tag_removed':
            error = requireKey(config, 'tag_id')
            break
        case 'trigger.inbound_message_pattern':
            error = requireKey(config, 'patterns')
            break
        case 'trigger.time_offset_from_date':
            error = requireKey(config, 'source')
            break
        case 'trigger.time_in_stage':
            error = requireKey(config, 'stage_id')
            break
        case 'trigger.calendly_invitee_created':
            // Filtros opcionais. Se marcar "criar card", exige pipeline + stage + dono.
            if (config.create_card_if_missing) {
                if (!config.create_card_pipeline_id) error = 'Escolha o pipeline pra criar o card'
                else if (!config.create_card_stage_id) error = 'Escolha a etapa inicial'
                else if (config.owner_mode === 'fixed' && !config.owner_user_id) error = 'Escolha o usuário dono'
            }
            break

        case 'action.create_task':
            error = requireKey(config, 'titulo')
            break
        case 'action.complete_task':
            error = requireKey(config, 'target_node_id')
            break
        case 'action.change_stage':
            error = requireKey(config, 'target_stage_id')
            break
        case 'action.add_tag':
        case 'action.remove_tag':
            error = requireKey(config, 'tag_id')
            break
        case 'action.update_field':
            error = requireKey(config, 'field_key')
            break
        case 'action.update_contact_field':
            error = requireKey(config, 'field_key') || requireKey(config, 'value')
            break
        case 'action.assign_owner':
            error = requireKey(config, 'user_id')
            break
        case 'action.notify_internal':
            error = requireKey(config, 'body')
            break

        case 'action.send_message': {
            const mode = (config.send_mode as string) || (config.hsm_template_name ? 'hsm' : 'text')
            if (!config.phone_number_id) error = 'Escolha a linha WhatsApp'
            else if (mode === 'hsm' && !config.hsm_template_name) error = 'Selecione um template HSM'
            else if (mode === 'text' && !config.corpo && !config.template_id) error = 'Defina o texto da mensagem'
            break
        }
        case 'action.send_media':
            if (!config.phone_number_id) error = 'Escolha a linha WhatsApp'
            else if (!config.media_url) error = 'Defina a URL da mídia'
            else if (!config.mime_type) error = 'Defina o tipo do arquivo'
            break
        case 'action.send_email':
            error = requireKey(config, 'subject') || requireKey(config, 'corpo')
            break

        case 'action.echo_assign':
        case 'action.echo_add_co_owner':
        case 'action.echo_remove_co_owner':
            // assign permite card_owner sem user_id explícito
            if (type === 'action.echo_assign' && config.assign_to === 'card_owner') break
            error = requireKey(config, 'user_id')
            break
        case 'action.echo_set_status':
            error = requireKey(config, 'status')
            break
        case 'action.echo_add_tag':
        case 'action.echo_remove_tag':
            error = requireKey(config, 'tag_id')
            break
        case 'action.echo_release':
        case 'action.echo_close':
            // sem obrigatório
            break

        case 'action.wait':
            if (!config.duration_minutes) error = 'Defina a duração'
            break
        case 'action.branch':
            error = requireKey(config, 'condition_type')
            break
        case 'action.end':
            // resultado tem default, ok
            break
        case 'action.start_cadence':
            error = requireKey(config, 'target_template_id')
            break
        case 'action.trigger_n8n_webhook':
            error = requireKey(config, 'url')
            break
    }

    return { valid: error === null, error }
}

export function validateAllNodes(nodes: WorkflowNode[]): WorkflowNode[] {
    return nodes.map((node) => {
        const { valid, error } = validateNode(
            node.type as WorkflowNodeType,
            (node.data.config as Record<string, unknown>) || {},
        )
        return { ...node, data: { ...node.data, valid, error } }
    })
}
