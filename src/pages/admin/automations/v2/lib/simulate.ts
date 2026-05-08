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

/**
 * Executa pra valer (chama Echo, cria tarefas, etc) — sem passar pela queue.
 * Mesmo mapping que simulate, mas action='execute_trigger_now'.
 */
export async function runWorkflowNow(args: {
    cardId: string
    triggerNode: WorkflowNode
    firstActionNode: WorkflowNode | null
}): Promise<SimulationResult> {
    const { cardId, triggerNode, firstActionNode } = args

    if (!firstActionNode) {
        return { success: false, error: 'Adicione pelo menos uma ação ligada ao gatilho.' }
    }

    let actionType = ''
    let actionConfig: Record<string, unknown> = {}
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
    else return { success: false, error: `Ação "${t}" ainda não pode ser disparada manualmente — use o gatilho real.` }

    actionConfig = (firstActionNode.data.config as Record<string, unknown>) || {}
    if (t.startsWith('action.echo_')) {
        const sub = t.replace('action.echo_', '')
        actionConfig = { ...actionConfig, action: sub }
    }

    const { data, error } = await supabase.functions.invoke('cadence-engine', {
        body: {
            action: 'execute_trigger_now',
            card_id: cardId,
            trigger: {
                id: 'manual_run',
                name: triggerNode.data.label || 'Disparo manual',
                action_type: actionType,
                action_config: actionConfig,
            },
        },
    })

    if (error) return { success: false, error: error.message }
    if (data?.error) return { success: false, error: data.error }
    return { success: true, payload: data }
}

/**
 * Roda a cadência inteira via start_cadence — cria a instance, enfileira o
 * primeiro step e o pg_cron processa step-a-step (respeita waits, branches,
 * auto_cancel_on_stage_change). Diferente de runWorkflowNow que executa só
 * a primeira ação.
 *
 * Pré-requisito: workflow tem que estar salvo (templateId != null). O caller
 * (Toolbar) trata o save antes de chamar isso.
 */
export interface RunFullResult extends SimulationResult {
    instanceId?: string
    /** Já havia instance ativa pra esse card+template (HTTP 409) */
    alreadyRunning?: boolean
}

export async function runWorkflowFull(args: {
    cardId: string
    templateId: string
    /** force=true: roda mesmo se o template estiver inativo (modo teste manual) */
    force?: boolean
}): Promise<RunFullResult> {
    const { cardId, templateId, force } = args

    const { data, error } = await supabase.functions.invoke('cadence-engine', {
        body: { action: 'start_cadence', card_id: cardId, template_id: templateId, force: !!force },
    })

    if (error) {
        // supabase-js v2 envolve a Response da edge function em FunctionsHttpError.
        // O status real fica em error.context (uma Response do Fetch API).
        // error.message é genérico ("Edge Function returned a non-2xx status code"),
        // então pra detectar 409 precisamos ler o status do context.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context as Response | undefined
        const status = ctx?.status
        let bodyMsg = ''
        try {
            const body = await ctx?.json?.()
            if (body?.error) bodyMsg = String(body.error)
        } catch {
            // body pode não ser JSON em alguns erros — segue com bodyMsg vazio
        }
        if (status === 409 || bodyMsg.toLowerCase().includes('already active')) {
            return { success: false, alreadyRunning: true, error: bodyMsg || 'Já existe uma instância rodando pra esse card.' }
        }
        return { success: false, error: bodyMsg || error.message }
    }
    if (data?.error) {
        return { success: false, error: data.error }
    }
    return { success: true, instanceId: data?.instance_id, payload: data }
}

/**
 * Cancela a instance ativa de um card+template específico (se existir).
 * Usado quando o user pede pra "reiniciar" a cadência.
 */
export async function cancelActiveInstance(args: {
    cardId: string
    templateId: string
}): Promise<{ success: boolean; error?: string }> {
    // Busca instance ativa
    const { data: instances, error: findErr } = await supabase
        .from('cadence_instances')
        .select('id')
        .eq('card_id', args.cardId)
        .eq('template_id', args.templateId)
        .in('status', ['active', 'waiting_task', 'paused'])
        .limit(1)
    if (findErr) return { success: false, error: findErr.message }
    if (!instances || instances.length === 0) return { success: true }

    const { error } = await supabase.functions.invoke('cadence-engine', {
        body: { action: 'cancel_cadence', instance_id: instances[0].id, reason: 'manual_restart' },
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
}
