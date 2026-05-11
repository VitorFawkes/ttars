/**
 * useTemplateInstances — alimenta o painel "Execuções" ao vivo.
 *
 * Carrega instances recentes do template (status atual + cards) e o
 * cadence_event_log dos últimos minutos. Polling a cada 5s pra parecer
 * "ao vivo" sem precisar de Realtime channel — basta pra um painel que
 * fica aberto.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TemplateInstance {
    id: string
    card_id: string
    status: string
    started_at: string
    completed_at: string | null
    cancelled_at: string | null
    cancelled_reason: string | null
    current_step_id: string | null
    total_contacts_attempted: number | null
    successful_contacts: number | null
    /** Joined: card.titulo */
    card_titulo: string | null
    /** Joined: pipeline_stage.nome */
    stage_nome: string | null
}

export interface TemplateEventLog {
    id: string
    instance_id: string | null
    card_id: string | null
    event_type: string
    event_source: string
    action_taken: string | null
    created_at: string
}

export interface TemplateInstancesData {
    /** Resumo por status (active, waiting_task, completed, cancelled, failed) */
    counts: Record<string, number>
    /** Active + waiting_task — instances "rodando agora" */
    runningCount: number
    /** Lista paginada (até limit) ordenada por started_at desc */
    instances: TemplateInstance[]
    /** Eventos de log das últimas 2h, mais recentes primeiro */
    events: TemplateEventLog[]
}

const ACTIVE_STATUSES = ['active', 'waiting_task', 'paused']

export function useTemplateInstances(
    templateId: string | null,
    options?: { limit?: number; refreshMs?: number },
) {
    const limit = options?.limit ?? 50
    const refreshMs = options?.refreshMs ?? 5000

    return useQuery<TemplateInstancesData>({
        queryKey: ['template-instances', templateId, limit],
        enabled: !!templateId,
        refetchInterval: refreshMs,
        refetchIntervalInBackground: false,
        queryFn: async (): Promise<TemplateInstancesData> => {
            if (!templateId) {
                return { counts: {}, runningCount: 0, instances: [], events: [] }
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb = supabase as any

            const sinceLog = new Date(Date.now() - 2 * 3600 * 1000).toISOString()

            const [instancesRes, eventsRes, countsRes] = await Promise.all([
                sb
                    .from('cadence_instances')
                    .select('id, card_id, status, started_at, completed_at, cancelled_at, cancelled_reason, current_step_id, total_contacts_attempted, successful_contacts, card:cards(titulo, pipeline_stage_id, pipeline_stage:pipeline_stages(nome))')
                    .eq('template_id', templateId)
                    .order('started_at', { ascending: false })
                    .limit(limit),
                sb
                    .from('cadence_event_log')
                    .select('id, instance_id, card_id, event_type, event_source, action_taken, created_at')
                    .gte('created_at', sinceLog)
                    .order('created_at', { ascending: false })
                    .limit(200),
                // counts agrupados por status
                sb
                    .from('cadence_instances')
                    .select('status')
                    .eq('template_id', templateId),
            ])

            if (instancesRes.error) throw instancesRes.error
            if (countsRes.error) throw countsRes.error

            const counts: Record<string, number> = {}
            for (const row of (countsRes.data || []) as Array<{ status: string }>) {
                counts[row.status] = (counts[row.status] || 0) + 1
            }
            const runningCount = ACTIVE_STATUSES.reduce((acc, s) => acc + (counts[s] || 0), 0)

            const instances: TemplateInstance[] = (instancesRes.data || []).map((row: Record<string, unknown>) => {
                const card = row.card as { titulo?: string; pipeline_stage?: { nome?: string } } | null
                return {
                    id: row.id as string,
                    card_id: row.card_id as string,
                    status: row.status as string,
                    started_at: row.started_at as string,
                    completed_at: (row.completed_at as string) || null,
                    cancelled_at: (row.cancelled_at as string) || null,
                    cancelled_reason: (row.cancelled_reason as string) || null,
                    current_step_id: (row.current_step_id as string) || null,
                    total_contacts_attempted: (row.total_contacts_attempted as number) ?? 0,
                    successful_contacts: (row.successful_contacts as number) ?? 0,
                    card_titulo: card?.titulo || null,
                    stage_nome: card?.pipeline_stage?.nome || null,
                }
            })

            // Filtra eventos pelos card_ids dessas instances pra reduzir ruído de outras cadências
            const allowedInstanceIds = new Set(instances.map((i) => i.id))
            const events: TemplateEventLog[] = ((eventsRes.data || []) as TemplateEventLog[])
                .filter((e) => e.instance_id && allowedInstanceIds.has(e.instance_id))

            return { counts, runningCount, instances, events }
        },
    })
}
