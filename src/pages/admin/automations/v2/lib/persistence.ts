/**
 * Persistência DAG ↔ banco.
 *
 * Mapeia o canvas (nodes + edges) pra:
 *   - 1 row em cadence_templates (metadados do workflow)
 *   - N rows em cadence_steps (as actions; via RPC replace_cadence_steps)
 *   - 1 row em cadence_event_triggers (o trigger node, com action_type='start_cadence'
 *     e target_template_id apontando pro template criado/atualizado)
 *
 * Limitação atual: cadence_steps suporta os step_types
 * task/wait/branch/end/message/send_media/echo_action. Tipos de ação que
 * só existem como action_type de trigger (change_stage, add_tag,
 * remove_tag, update_field, notify_internal, start_cadence sub-cadência,
 * trigger_n8n_webhook) ainda não persistem como step encadeado — quando
 * aparecem no canvas como step, retornamos erro pedindo pro user
 * substituir ou usar o builder simples. Migration futura pode estender.
 */
import { supabase } from '@/lib/supabase'
import type { Edge } from '@xyflow/react'
import type {
    WorkflowNode,
    TriggerNodeType,
    ActionNodeType,
} from '../types'

// ----------------------------------------------------------------------------
// Mapping node → step_type / action_type
// ----------------------------------------------------------------------------

/** Tipos de node que podem virar cadence_steps (encadeados).
 *  Todos os 22 ActionNodeType cobertos — nenhum bloqueio mais. */
const NODE_TO_STEP_TYPE: Partial<Record<ActionNodeType, string>> = {
    'action.create_task':  'task',
    'action.send_message': 'message',
    'action.send_media':   'send_media',
    'action.wait':         'wait',
    'action.branch':       'branch',
    'action.end':          'end',
    // Echo (sub-action dentro de echo_config.action)
    'action.echo_assign':          'echo_action',
    'action.echo_release':         'echo_action',
    'action.echo_close':           'echo_action',
    'action.echo_set_status':      'echo_action',
    'action.echo_add_tag':         'echo_action',
    'action.echo_remove_tag':      'echo_action',
    'action.echo_add_co_owner':    'echo_action',
    'action.echo_remove_co_owner': 'echo_action',
    // Card actions (sub-action dentro de card_action_config.action)
    'action.complete_task':       'card_action',
    'action.change_stage':        'card_action',
    'action.add_tag':             'card_action',
    'action.remove_tag':          'card_action',
    'action.update_field':        'card_action',
    'action.update_contact_field':'card_action',
    'action.assign_owner':        'card_action',
    'action.mark_card_result':    'card_action',
    'action.notify_internal':     'card_action',
    'action.start_cadence':       'card_action',
    'action.trigger_n8n_webhook': 'card_action',
    'action.send_email':          'card_action',
}

/** Sub-action de cada node do tipo card_action. */
const NODE_TO_CARD_SUB_ACTION: Partial<Record<ActionNodeType, string>> = {
    'action.complete_task':       'complete_task',
    'action.change_stage':        'change_stage',
    'action.add_tag':             'add_tag',
    'action.remove_tag':          'remove_tag',
    'action.update_field':        'update_field',
    'action.update_contact_field':'update_contact_field',
    'action.assign_owner':        'assign_owner',
    'action.mark_card_result':    'mark_result',
    'action.notify_internal':     'notify_internal',
    'action.start_cadence':       'start_cadence',
    'action.trigger_n8n_webhook': 'trigger_n8n_webhook',
    'action.send_email':          'send_email',
}

/** trigger.<x> → event_type Echo. */
const NODE_TO_EVENT_TYPE: Record<TriggerNodeType, string> = {
    'trigger.card_created':            'card_created',
    'trigger.stage_enter':             'stage_enter',
    'trigger.macro_stage_enter':       'macro_stage_enter',
    'trigger.field_changed':           'field_changed',
    'trigger.tag_added':               'tag_added',
    'trigger.tag_removed':             'tag_removed',
    'trigger.inbound_message_pattern': 'inbound_message_pattern',
    'trigger.time_offset_from_date':   'time_offset_from_date',
    'trigger.time_in_stage':           'time_in_stage',
    'trigger.calendly_invitee_created':'calendly_invitee_created',
}

/** Inverso pra deserialização. */
const EVENT_TYPE_TO_NODE = Object.fromEntries(
    Object.entries(NODE_TO_EVENT_TYPE).map(([k, v]) => [v, k as TriggerNodeType]),
) as Record<string, TriggerNodeType>

const STEP_TYPE_TO_NODE = (step: {
    step_type: string
    echo_config?: { action?: string } | null
    card_action_config?: { action?: string } | null
}): ActionNodeType => {
    switch (step.step_type) {
        case 'task':       return 'action.create_task'
        case 'wait':       return 'action.wait'
        case 'branch':     return 'action.branch'
        case 'end':        return 'action.end'
        case 'message':    return 'action.send_message'
        case 'send_media': return 'action.send_media'
        case 'echo_action': {
            const sub = step.echo_config?.action
            switch (sub) {
                case 'assign':          return 'action.echo_assign'
                case 'release':         return 'action.echo_release'
                case 'close':           return 'action.echo_close'
                case 'set_status':      return 'action.echo_set_status'
                case 'add_tag':         return 'action.echo_add_tag'
                case 'remove_tag':      return 'action.echo_remove_tag'
                case 'add_co_owner':    return 'action.echo_add_co_owner'
                case 'remove_co_owner': return 'action.echo_remove_co_owner'
                default:                return 'action.echo_assign'
            }
        }
        case 'card_action': {
            const sub = step.card_action_config?.action
            switch (sub) {
                case 'complete_task':       return 'action.complete_task'
                case 'change_stage':        return 'action.change_stage'
                case 'add_tag':             return 'action.add_tag'
                case 'remove_tag':          return 'action.remove_tag'
                case 'update_field':        return 'action.update_field'
                case 'update_contact_field':return 'action.update_contact_field'
                case 'assign_owner':        return 'action.assign_owner'
                case 'mark_result':         return 'action.mark_card_result'
                case 'notify_internal':     return 'action.notify_internal'
                case 'start_cadence':       return 'action.start_cadence'
                case 'trigger_n8n_webhook': return 'action.trigger_n8n_webhook'
                case 'send_email':          return 'action.send_email'
                default:                    return 'action.change_stage'
            }
        }
        default: return 'action.create_task'
    }
}

// ----------------------------------------------------------------------------
// Save
// ----------------------------------------------------------------------------

export interface SavePayload {
    templateId: string | null
    name: string
    description: string
    isActive: boolean
    autoCancelOnStageChange: boolean
    respectBusinessHours: boolean
    nodes: WorkflowNode[]
    edges: Edge[]
}

export interface SaveResult {
    success: boolean
    templateId?: string
    error?: string
}

export async function saveWorkflow(payload: SavePayload): Promise<SaveResult> {
    const triggerNode = payload.nodes.find((n) => (n.type as string).startsWith('trigger.'))
    if (!triggerNode) {
        return { success: false, error: 'Adicione um gatilho ao workflow.' }
    }
    if (!payload.name.trim()) {
        return { success: false, error: 'Dê um nome ao workflow.' }
    }

    // Validar tipos não persistíveis como step (todos os ActionNodeType
    // hoje têm step_type — bloqueio só dispara se aparecer um tipo novo
    // que ainda não foi mapeado).
    const unsupportedSteps = payload.nodes.filter((n) => {
        const t = n.type as ActionNodeType
        if ((n.type as string).startsWith('trigger.')) return false
        return !NODE_TO_STEP_TYPE[t]
    })
    if (unsupportedSteps.length > 0) {
        const names = unsupportedSteps.map((n) => n.data.label).join(', ')
        return {
            success: false,
            error: `Tipo desconhecido: "${names}". Atualize o app.`,
        }
    }

    // Validar que todo nó Decisão (branch) tem AMBAS as saídas conectadas.
    // Sem isso, em runtime a condição cai numa alça sem destino e o fluxo trava
    // em silêncio (o motor não usa next_step_key como fallback em branch).
    const branchNodes = payload.nodes.filter((n) => n.type === 'action.branch')
    for (const b of branchNodes) {
        const handles = new Set(
            payload.edges.filter((e) => e.source === b.id).map((e) => e.sourceHandle),
        )
        if (!handles.has('true') || !handles.has('false')) {
            return {
                success: false,
                error: `A Decisão "${b.data.label || 'sem nome'}" precisa ter as duas saídas (verdadeiro e falso) conectadas.`,
            }
        }
    }

    // 1) Upsert cadence_templates
    const templatePayload = {
        name: payload.name,
        description: payload.description || null,
        is_active: payload.isActive,
        auto_cancel_on_stage_change: payload.autoCancelOnStageChange,
        respect_business_hours: payload.respectBusinessHours,
        execution_mode: 'linear',
        schedule_mode: 'interval',
        // Marca quem nasceu no editor visual — usado pelo hub pra rotear
        // o "Editar" de volta pro v2.
        editor_version: 'v2',
    }

    let templateId = payload.templateId
    if (!templateId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from('cadence_templates')
            .insert(templatePayload)
            .select('id')
            .single()
        if (error) return { success: false, error: error.message }
        templateId = data?.id as string
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('cadence_templates')
            .update(templatePayload)
            .eq('id', templateId)
        if (error) return { success: false, error: error.message }
    }
    if (!templateId) return { success: false, error: 'Falha ao criar template.' }

    // 2) Topologia: nós ordenados por BFS a partir do trigger via edges
    const stepNodes = payload.nodes.filter((n) => !(n.type as string).startsWith('trigger.'))
    const edgesBySource = new Map<string, Edge[]>()
    for (const e of payload.edges) {
        const list = edgesBySource.get(e.source) || []
        list.push(e)
        edgesBySource.set(e.source, list)
    }

    // BFS a partir do trigger pra ordenar e gerar step_keys consistentes
    const orderMap = new Map<string, number>()
    const queue: string[] = [triggerNode.id]
    let order = 0
    while (queue.length) {
        const id = queue.shift()!
        if (orderMap.has(id)) continue
        orderMap.set(id, order++)
        const next = (edgesBySource.get(id) || []).map((e) => e.target)
        queue.push(...next)
    }
    // Nós soltos (não conectados) entram no fim
    for (const n of stepNodes) {
        if (!orderMap.has(n.id)) orderMap.set(n.id, order++)
    }

    const orderedSteps = stepNodes
        .map((n, idx) => ({ node: n, _origIdx: idx }))
        .sort((a, b) => (orderMap.get(a.node.id) ?? 0) - (orderMap.get(b.node.id) ?? 0))

    // 3) Montar payload de cadence_steps
    const stepRows = orderedSteps.map(({ node }, idx) => {
        // step_key precisa ser único por template_id (UNIQUE constraint).
        // Usar o node.id INTEIRO — slice(0,12) anterior pegava só o prefixo
        // do tipo (ex: "send_message_") e duplicava quando havia 2+ nodes
        // do mesmo tipo, batendo na unique. Tipos do React Flow id já são
        // [a-z_0-9-] safe pra usar direto como step_key.
        const stepKey = `n_${node.id}`
        const stepType = NODE_TO_STEP_TYPE[node.type as ActionNodeType]

        // next_step_key: pega primeira aresta que sai daqui pra outro step.
        // Branch é exceção: o roteamento é só por branches[] (alça true/false), então
        // next_step_key fica null pra não fazer o card avançar quando a condição falha.
        const out = (edgesBySource.get(node.id) || [])
            .filter((e) => stepNodes.some((sn) => sn.id === e.target))
        const nextStepKey = node.type === 'action.branch'
            ? null
            : out[0]
                ? `n_${out[0].target}`
                : null

        // Configs por tipo: roteia a config genérica pro slot correto
        const cfg = (node.data.config as Record<string, unknown>) || {}
        const slotByType: Record<string, string> = {
            'action.create_task':  'task_config',
            'action.send_message': 'message_config',
            'action.send_media':   'media_config',
            'action.wait':         'wait_config',
            'action.branch':       'branch_config',
            'action.end':          'end_config',
        }
        const isEcho = (node.type as string).startsWith('action.echo_')
        const cardSubAction = NODE_TO_CARD_SUB_ACTION[node.type as ActionNodeType]
        const isCardAction = !!cardSubAction
        let slot: string
        if (isEcho) slot = 'echo_config'
        else if (isCardAction) slot = 'card_action_config'
        else slot = slotByType[node.type as ActionNodeType] || 'task_config'
        const stepConfig: Record<string, unknown> = { [slot]: cfg }

        // Echo: sub-action vem do tipo do node, garantida no echo_config
        if (isEcho) {
            const sub = (node.type as string).replace('action.echo_', '')
            stepConfig.echo_config = { ...cfg, action: sub }
        }
        // Card actions: mesmo padrão, action no card_action_config
        if (isCardAction) {
            stepConfig.card_action_config = { ...cfg, action: cardSubAction }
        }

        // complete_task: o usuário escolhe `target_node_id` na UI (id do node
        // de create_task upstream). No banco precisa virar `target_step_key`
        // no formato que o save usa pros outros steps (`n_<nodeId>`), pra que
        // o engine encontre a tarefa pelo cadence_step_key gravado em metadata.
        if (node.type === 'action.complete_task') {
            const targetNodeId = (cfg as Record<string, unknown>).target_node_id as string | null | undefined
            const targetStepKey = targetNodeId ? `n_${targetNodeId}` : null
            stepConfig.card_action_config = {
                ...cfg,
                action: 'complete_task',
                target_step_key: targetStepKey,
            }
        }

        // Branch precisa de branches[] no branch_config baseado nas edges
        if (node.type === 'action.branch') {
            const branches = out.map((e) => ({
                handle: e.sourceHandle || 'true',
                target_step_key: `n_${e.target}`,
            }))
            stepConfig.branch_config = { ...(cfg as object), branches }
        }

        return {
            step_order: idx + 1,
            step_key: stepKey,
            step_type: stepType,
            block_index: 0,
            day_offset: 0,
            requires_previous_completed: false,
            next_step_key: nextStepKey,
            ...stepConfig,
        }
    })

    // 4) Persistir steps via RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stepsError } = await (supabase as any).rpc('replace_cadence_steps', {
        p_template_id: templateId,
        p_steps: stepRows,
    })
    if (stepsError) return { success: false, error: stepsError.message }

    // 5) Upsert cadence_event_triggers (o gatilho aponta pra start_cadence neste template)
    const triggerEventType = NODE_TO_EVENT_TYPE[triggerNode.type as TriggerNodeType]
    const triggerCfg = (triggerNode.data.config as Record<string, unknown>) || {}

    // Auto-migra config legado: editor antigo (pré-PR#26) gravava o filtro
    // de etapa em event_config.initial_stage_id (string) em vez de
    // applicable_stage_ids (UUID[]). Se o user abrir um template legado e
    // salvar sem mexer no select, o config em memória ainda tem o campo
    // legado e o save reverte a coluna pra null — bug recorrente.
    // Aqui normalizamos sempre antes de gravar: applicable_stage_ids vira
    // a fonte da verdade e initial_stage_id sai do event_config.
    let applicableStageIds: string[] | null = Array.isArray(triggerCfg.applicable_stage_ids)
        ? (triggerCfg.applicable_stage_ids as string[])
        : null
    const legacyInitialStageId = triggerCfg.initial_stage_id
    if ((!applicableStageIds || applicableStageIds.length === 0)
        && typeof legacyInitialStageId === 'string'
        && legacyInitialStageId) {
        applicableStageIds = [legacyInitialStageId]
    }
    const cleanEventConfig: Record<string, unknown> = { ...triggerCfg }
    delete cleanEventConfig.initial_stage_id
    delete cleanEventConfig.applicable_stage_ids

    const triggerPayload = {
        name: `${payload.name} — gatilho`,
        event_type: triggerEventType,
        event_config: cleanEventConfig,
        action_type: 'start_cadence',
        action_config: { target_template_id: templateId },
        target_template_id: templateId,
        applicable_stage_ids: applicableStageIds,
        is_active: payload.isActive,
        delay_minutes: 0,
    }

    // Existe trigger pra esse template? (procurar por target_template_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingTrigger } = await (supabase as any)
        .from('cadence_event_triggers')
        .select('id')
        .eq('target_template_id', templateId)
        .limit(1)
        .maybeSingle()

    if (existingTrigger?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('cadence_event_triggers')
            .update(triggerPayload)
            .eq('id', existingTrigger.id)
        if (error) return { success: false, error: error.message }
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from('cadence_event_triggers')
            .insert(triggerPayload)
        if (error) return { success: false, error: error.message }
    }

    return { success: true, templateId }
}

// ----------------------------------------------------------------------------
// Load
// ----------------------------------------------------------------------------

export interface LoadResult {
    success: boolean
    error?: string
    templateId?: string
    name?: string
    description?: string
    isActive?: boolean
    autoCancelOnStageChange?: boolean
    respectBusinessHours?: boolean
    nodes?: WorkflowNode[]
    edges?: Edge[]
}

export async function loadWorkflow(templateId: string): Promise<LoadResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: tplErr } = await (supabase as any)
        .from('cadence_templates')
        .select('*')
        .eq('id', templateId)
        .single()
    if (tplErr || !template) return { success: false, error: tplErr?.message || 'Template não encontrado' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: steps, error: stepsErr } = await (supabase as any)
        .from('cadence_steps')
        .select('*')
        .eq('template_id', templateId)
        .order('step_order')
    if (stepsErr) return { success: false, error: stepsErr.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: trigger } = await (supabase as any)
        .from('cadence_event_triggers')
        .select('*')
        .eq('target_template_id', templateId)
        .limit(1)
        .maybeSingle()

    // Layout vertical: trigger no topo, depois cada step com gap fixo
    const X = 250
    const GAP_Y = 140
    const nodes: WorkflowNode[] = []

    if (trigger) {
        const triggerType = EVENT_TYPE_TO_NODE[trigger.event_type as string] || 'trigger.card_created'
        const baseEventConfig = (trigger.event_config as Record<string, unknown>) || {}
        const config: Record<string, unknown> = { ...baseEventConfig }
        if (Array.isArray(trigger.applicable_stage_ids) && trigger.applicable_stage_ids.length > 0) {
            config.applicable_stage_ids = trigger.applicable_stage_ids
        } else if (typeof baseEventConfig.initial_stage_id === 'string' && baseEventConfig.initial_stage_id) {
            // Triggers gravados pelo editor pré-PR#26 guardam o filtro em
            // event_config.initial_stage_id. saveWorkflow normaliza para
            // applicable_stage_ids no save; espelhamos no load pra que registros
            // legados ainda não re-salvos hidratem corretamente.
            config.applicable_stage_ids = [baseEventConfig.initial_stage_id]
            delete config.initial_stage_id
        }
        nodes.push({
            id: `trg_${trigger.id}`,
            type: triggerType,
            position: { x: X, y: 0 },
            data: {
                label: trigger.name || 'Gatilho',
                config,
            },
        })
    }

    const stepKeyToNodeId = new Map<string, string>()
    ;(steps || []).forEach((s: Record<string, unknown>, idx: number) => {
        const nodeId = `step_${s.id}`
        stepKeyToNodeId.set(s.step_key as string, nodeId)
        const nodeType = STEP_TYPE_TO_NODE({
            step_type: s.step_type as string,
            echo_config: s.echo_config as { action?: string } | null,
            card_action_config: s.card_action_config as { action?: string } | null,
        })
        // Recupera config do slot certo
        const cfg = (s.message_config as Record<string, unknown>)
            || (s.media_config as Record<string, unknown>)
            || (s.echo_config as Record<string, unknown>)
            || (s.card_action_config as Record<string, unknown>)
            || (s.task_config as Record<string, unknown>)
            || (s.wait_config as Record<string, unknown>)
            || (s.branch_config as Record<string, unknown>)
            || (s.end_config as Record<string, unknown>)
            || {}
        nodes.push({
            id: nodeId,
            type: nodeType,
            position: { x: X, y: (idx + 1) * GAP_Y },
            data: {
                // Sem nome customizado, deixa vazio — BaseNode usa meta.label
                // do registry como fallback ("Enviar mensagem", "Esperar", ...).
                // step_key do banco é técnico e não deve aparecer pro usuário.
                label: (cfg?.titulo as string) || '',
                config: cfg,
                // step_key do banco — usado por useInstanceTrail pra mapear
                // eventos de cadence_event_log (que registram step_key) de
                // volta pro node.id da UI. Não renderiza em lugar nenhum.
                __stepKey: s.step_key as string,
            },
        })
    })

    // 2º pass: resolve referências entre steps pela map stepKey→nodeId.
    // Hoje só complete_task tem isso (`target_step_key` apontando pra um
    // create_task upstream). O editor precisa do `target_node_id` (id do node
    // na UI), então fazemos a conversão depois que todos os steps viraram nodes.
    for (const node of nodes) {
        if (node.type !== 'action.complete_task') continue
        const cfg = node.data.config as Record<string, unknown>
        const targetStepKey = cfg?.target_step_key as string | null | undefined
        if (!targetStepKey) continue
        const resolved = stepKeyToNodeId.get(targetStepKey) ?? null
        node.data.config = { ...cfg, target_node_id: resolved }
    }

    // Edges
    const edges: Edge[] = []
    // trigger → primeiro step
    if (trigger && (steps || []).length > 0) {
        const firstStep = (steps as Array<Record<string, unknown>>)[0]
        edges.push({
            id: `e_trg_${firstStep.id}`,
            source: `trg_${trigger.id}`,
            target: `step_${firstStep.id}`,
            type: 'smoothstep',
            animated: true,
        })
    }
    // step → next_step_key (steps lineares; branch é tratado à parte abaixo via branches[])
    ;(steps || []).forEach((s: Record<string, unknown>) => {
        if (s.step_type === 'branch') return
        const nextKey = s.next_step_key as string | null
        if (!nextKey) return
        const targetNodeId = stepKeyToNodeId.get(nextKey)
        if (!targetNodeId) return
        edges.push({
            id: `e_${s.id}_${targetNodeId}`,
            source: `step_${s.id}`,
            target: targetNodeId,
            type: 'smoothstep',
            animated: true,
        })
    })
    // branch → arestas a partir de branch_config.branches, preservando a alça (true/false)
    ;(steps || []).forEach((s: Record<string, unknown>) => {
        if (s.step_type !== 'branch') return
        const bc = (s.branch_config as Record<string, unknown>) || {}
        const branches = (bc.branches as Array<Record<string, unknown>>) || []
        for (const b of branches) {
            const targetNodeId = stepKeyToNodeId.get(b.target_step_key as string)
            if (!targetNodeId) continue
            const handle = (b.handle as string) || 'true'
            edges.push({
                id: `e_${s.id}_${handle}_${targetNodeId}`,
                source: `step_${s.id}`,
                target: targetNodeId,
                sourceHandle: handle,
                type: 'smoothstep',
                animated: true,
            })
        }
    })

    return {
        success: true,
        templateId,
        name: template.name as string,
        description: (template.description as string) || '',
        isActive: !!template.is_active,
        autoCancelOnStageChange: !!template.auto_cancel_on_stage_change,
        respectBusinessHours: !!template.respect_business_hours,
        nodes,
        edges,
    }
}

// Re-exporta pra uso interno do pacote v2 — evita ciclo
void STEP_TYPE_TO_NODE
void NODE_TO_CARD_SUB_ACTION
