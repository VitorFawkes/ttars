/**
 * useInstanceTrail — hidrata o store com o trajeto de uma cadence_instance
 * pra destacar no canvas onde o card está agora e por onde já passou.
 *
 * Disparado quando o user clica numa execução no ExecutionsPanel
 * (`setHighlightedInstance(id)`). Polling 5s pra acompanhar avanços em
 * tempo real enquanto a instance permanece destacada.
 *
 * Como reconstrói o trajeto:
 *   1. cadence_instances → current_step_id, status, card.titulo, timestamps.
 *   2. cadence_event_log filtrado por instance_id → extrai step_keys de
 *      event_data->>step_key (eventos que tocam step).
 *   3. node.data.__stepKey (gravado no load em persistence.ts) → map
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
        queryFn: async (): Promise<{ instance: InstanceRow; events: EventRow[] } | null> => {
            if (!instanceId) return null
            const [instanceRes, eventsRes] = await Promise.all([
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
            ])
            if (instanceRes.error) throw instanceRes.error
            if (!instanceRes.data) return null
            const instance = instanceRes.data as unknown as InstanceRow
            const events = ((eventsRes.data || []) as unknown as EventRow[])
            return { instance, events }
        },
    })

    useEffect(() => {
        if (!instanceId) {
            setHighlightedTrail(null)
            return
        }
        const payload = query.data
        if (!payload) return
        const { instance, events } = payload

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

        // current node — direto pelo current_step_id (UUID → "step_<uuid>")
        const currentNodeId = instance.current_step_id ? `step_${instance.current_step_id}` : null

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
