import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface SLAViolation {
    card_id: string
    titulo: string
    stage_nome: string
    owner_nome: string
    dias_na_etapa: number
    sla_hours: number
    sla_exceeded_hours: number
}

export interface SLAStageSummary {
    stage_nome: string
    sla_hours: number
    total_cards: number
    compliant_cards: number
    violating_cards: number
    compliance_rate: number | null
    avg_hours_in_stage: number
}

export function useSLAViolations() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'sla-violations', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_sla_violations', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_limit: 50,
            })
            if (error) throw error
            return (data as unknown as SLAViolation[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useSLASummary() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'sla-summary', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_sla_summary', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as SLAStageSummary[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
