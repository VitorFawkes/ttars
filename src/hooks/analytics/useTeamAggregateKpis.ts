import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TeamAggregateKpisRow {
    cards_ganhos: number
    cards_abertos: number
    receita_total: number
    faturamento_total: number
    tarefas_vencidas: number
}

export function useTeamAggregateKpis() {
    const { dateRange, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-aggregate-kpis', dateRange.start, dateRange.end, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_aggregate_kpis', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            const first = (Array.isArray(data) ? data[0] : data) as TeamAggregateKpisRow | undefined
            return first ?? null
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}

/** Mesmos KPIs agregados no período ANTERIOR (toggle "Comparar"). Só roda quando `enabled`. */
export function useTeamAggregateKpisPrevious(enabled: boolean) {
    const { dateRange, ownerIds, tagIds } = useAnalyticsFilters()

    const startMs = new Date(dateRange.start).getTime()
    const endMs = new Date(dateRange.end).getTime()
    const durationMs = endMs - startMs
    const previousEnd = new Date(startMs).toISOString()
    const previousStart = new Date(startMs - durationMs).toISOString()

    return useQuery({
        queryKey: ['analytics', 'team-aggregate-kpis-previous', previousStart, previousEnd, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_aggregate_kpis', {
                p_date_start: previousStart,
                p_date_end: previousEnd,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            const first = (Array.isArray(data) ? data[0] : data) as TeamAggregateKpisRow | undefined
            return first ?? null
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
        enabled: enabled && durationMs > 0,
    })
}
