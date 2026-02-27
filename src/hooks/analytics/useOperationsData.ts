import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface OperationsKpis {
    viagens_realizadas: number
    valor_total: number
    ticket_medio: number
}

export interface SubCardStats {
    total_sub_cards: number
    cards_with_changes: number
    changes_per_trip: number
}

export interface PlannerQuality {
    planner_nome: string
    planner_id: string
    viagens: number
    mudancas: number
    mudancas_por_viagem: number
    receita: number
}

export interface OperationsTimeline {
    week: string
    count: number
}

export interface OperationsData {
    kpis: OperationsKpis
    sub_card_stats: SubCardStats
    per_planner: PlannerQuality[]
    timeline: OperationsTimeline[]
}

export function useOperationsData() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'operations-summary', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_operations_summary', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as OperationsData) || null
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
