/**
 * Simular workflow — chama a action `simulate_automation` do edge function
 * cadence-engine pra fazer dry-run da automação contra um card real.
 *
 * Como o engine simula um TRIGGER (não cadência inteira), simulamos apenas a
 * primeira ação imediata após o trigger. Pra simular a cadência completa,
 * teríamos que estender o engine — fica pra iteração futura.
 */
import { supabase } from '@/lib/supabase'
import type { WorkflowNode } from '../types'

export interface SimulationResult {
    success: boolean
    error?: string
    /** Dump cru do que o engine retornaria */
    payload?: unknown
}

export async function simulateWorkflow(args: {
    cardId: string
    triggerNode: WorkflowNode
    firstActionNode: WorkflowNode | null
}): Promise<SimulationResult> {
    const { cardId, triggerNode, firstActionNode } = args

    // Monta um trigger "virtual" no formato que o cadence-engine entende.
    // A action_type é mapeada conforme o primeiro node de ação após o trigger.
    const eventType = (triggerNode.type as string).replace('trigger.', '')

    let actionType = 'create_task'
    let actionConfig: Record<string, unknown> = {}
    if (firstActionNode) {
        const t = firstActionNode.type as string
        if (t === 'action.send_message') actionType = 'send_message'
        else if (t === 'action.send_media') actionType = 'send_media'
        else if (t.startsWith('action.echo_')) actionType = 'echo_action'
        else if (t === 'action.create_task') actionType = 'create_task'
        else if (t === 'action.change_stage') actionType = 'change_stage'
        else if (t === 'action.add_tag') actionType = 'add_tag'
        else if (t === 'action.remove_tag') actionType = 'remove_tag'
        else if (t === 'action.update_field') actionType = 'update_field'
        else if (t === 'action.notify_internal') actionType = 'notify_internal'
        else if (t === 'action.start_cadence') actionType = 'start_cadence'
        else if (t === 'action.trigger_n8n_webhook') actionType = 'trigger_n8n_webhook'

        actionConfig = (firstActionNode.data.config as Record<string, unknown>) || {}

        // Echo: garantir action no config baseado no tipo do node
        if (t.startsWith('action.echo_')) {
            const sub = t.replace('action.echo_', '')
            actionConfig = { ...actionConfig, action: sub }
        }
    }

    const triggerCfg = (triggerNode.data.config as Record<string, unknown>) || {}

    const { data, error } = await supabase.functions.invoke('cadence-engine', {
        body: {
            action: 'simulate_automation',
            card_id: cardId,
            trigger: {
                id: 'simulated',
                name: 'Simulação',
                event_type: eventType,
                event_config: triggerCfg,
                action_type: actionType,
                action_config: actionConfig,
                applicable_stage_ids: triggerCfg.applicable_stage_ids || null,
            },
        },
    })

    if (error) return { success: false, error: error.message }
    return { success: true, payload: data }
}
