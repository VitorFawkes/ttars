/**
 * useInstanceTrail — hidrata o store com o trajeto de uma cadence_instance
 * pra destacar no canvas onde o card está agora e por onde já passou.
 *
 * Disparado quando o user clica numa execução no ExecutionsPanel
 * (`setHighlightedInstance(id)`). Polling 5s pra acompanhar avanços em
 * tempo real enquanto a instance permanece destacada.
 *
 * Como reconstrói o trajeto:
 *   1. cadence_instances → status, card.titulo, timestamps + current_step_id
 *      (usado só como fallback).
 *   2. cadence_queue pendente filtrado por instance_id → FONTE DE VERDADE
 *      pro current node. O engine às vezes não atualiza current_step_id
 *      em wait/branch (deixa o ponteiro travado no step anterior). A fila
 *      sempre tem o próximo step a executar com execute_at, então pegamos
 *      o item pending mais antigo como "onde o card está agora".
 *   3. cadence_event_log filtrado por instance_id → extrai step_keys de
 *      event_data->>step_key pra reconstruir os nodes já visitados.
 *   4. node.data.__stepKey (gravado no load em persistence.ts) → map
 *      step_key (banco) ↔ node.id (UI).
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkflowStore, type InstanceTrail } from '../store/useWorkflowStore'

interface InstanceRow {
    id: string
    card_id: string
    status: string
    started_at: string
    current_step_id: string | null
    card: { titulo: string | null } | null
}

interface EventRow {
    created_at: string
    event_type: string
    event_data: Record<string, unknown> | null
}

interface QueueRow {
    step_id: string
    execute_at: string
    status: string
}

/** event_types que carregam step_key no event_data — usados para reconstruir o trajeto. */
const STEP_EVENT_TYPES = new Set([
    'task_created',
    'wait_started',
    'step_executed',
    'entry_rule_task_created',
    'cadence_step_card_action_done',
    'cadence_step_card_action_failed',
    'cadence_step_card_action_skipped',
    'cadence_step_message_executed',
    'cadence_step_message_failed',
    'branch_evaluated',
])

export function useInstanceTrail(instanceId: string | null) {
    const setHighlightedTrail = useWorkflowStore((s) => s.setHighlightedTrail)
    const nodes = useWorkflowStore((s) => s.nodes)

    const query = useQuery({
        queryKey: ['instance-trail', instanceId],
        enabled: !!instanceId,
        refetchInterval: 5000,
        queryFn: async (): Promise<{ instance: InstanceRow; events: EventRow[]; queue: QueueRow[] } | null> => {
            if (!instanceId) return null
            const [instanceRes, eventsRes, queueRes] = await Promise.all([
                supabase
                    .from('cadence_instances')
                    .select('id, card_id, status, started_at, current_step_id, card:cards!cadence_instances_card_id_fkey(titulo)')
                    .eq('id', instanceId)
                    .maybeSingle(),
                supabase
                    .from('cadence_event_log')
                    .select('created_at, event_type, event_data')
                    .eq('instance_id', instanceId)
                    .order('created_at', { ascending: true })
                    .limit(200),
                supabase
                    .from('cadence_queue')
                    .select('step_id, execute_at, status')
                    .eq('instance_id', instanceId)
                    .in('status', ['pending', 'processing'])
                    .order('execute_at', { ascending: true })
                    .limit(5),
            ])
            if (instanceRes.error) throw instanceRes.error
            if (!instanceRes.data) return null
            const instance = instanceRes.data as unknown as InstanceRow
            const events = ((eventsRes.data || []) as unknown as EventRow[])
            const queue = ((queueRes.data || []) as unknown as QueueRow[])
            return { instance, events, queue }
        },
    })

    useEffect(() => {
        if (!instanceId) {
            setHighlightedTrail(null)
            return
        }
        const payload = query.data
        if (!payload) return
        const { instance, events, queue } = payload

        // step_key → node.id usando __stepKey gravado no load
        const stepKeyToNodeId = new Map<string, string>()
        for (const n of nodes) {
            const sk = (n.data as Record<string, unknown>)?.__stepKey as string | undefined
            if (sk) stepKeyToNodeId.set(sk, n.id)
        }

        // Trail percorrido — preserva ordem de aparição e deduplica
        const orderedStepKeys: string[] = []
        const seen = new Set<string>()
        let currentStepEnteredAt: string | null = null
        for (const ev of events) {
            if (!STEP_EVENT_TYPES.has(ev.event_type)) continue
            const sk = ev.event_data?.step_key as string | undefined
            if (!sk) continue
            if (!seen.has(sk)) {
                seen.add(sk)
                orderedStepKeys.push(sk)
            }
            currentStepEnteredAt = ev.created_at
        }

        // current node: a fila guarda o PRÓXIMO step a rodar. Distinguir:
        //   1. Item pending com execute_at <= now (5s slack) → pronto pra
        //      executar, ESSE é o current.
        //   2. Item pending com execute_at no futuro → o card está aguardando
        //      no wait/branch/etc que enfileirou esse item. Current = último
        //      step que rodou (último step_key visto nos eventos).
        //   3. Sem fila → usa current_step_id do banco (instance recém-criada
        //      ou último step já executado).
        const now = Date.now()
        const slackMs = 5000
        const pendingItems = queue.filter((q) => q.status === 'pending' || q.status === 'processing')
        const readyToRun = pendingItems.find((q) => new Date(q.execute_at).getTime() <= now + slackMs)
        const futureWaiting = !readyToRun && pendingItems.length > 0

        let currentNodeId: string | null = null
        if (readyToRun) {
            currentNodeId = `step_${readyToRun.step_id}`
            currentStepEnteredAt = readyToRun.execute_at
        } else if (futureWaiting && orderedStepKeys.length > 0) {
            const lastKey = orderedStepKeys[orderedStepKeys.length - 1]
            currentNodeId = stepKeyToNodeId.get(lastKey) ?? null
            // currentStepEnteredAt já é o created_at do último evento (loop acima).
        } else if (instance.current_step_id) {
            currentNodeId = `step_${instance.current_step_id}`
        }

        // Completed = todos os steps que apareceram em eventos, exceto o current
        const completedNodeIds = orderedStepKeys
            .map((sk) => stepKeyToNodeId.get(sk))
            .filter((id): id is string => !!id && id !== currentNodeId)

        const trail: InstanceTrail = {
            instanceId: instance.id,
            currentNodeId,
            completedNodeIds,
            cardTitulo: instance.card?.titulo ?? null,
            status: instance.status,
            startedAt: instance.started_at,
            currentStepEnteredAt,
        }
        setHighlightedTrail(trail)
    }, [instanceId, query.data, nodes, setHighlightedTrail])

    return query
}
