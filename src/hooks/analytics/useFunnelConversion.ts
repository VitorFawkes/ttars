import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface FunnelStageData {
    stage_id: string
    stage_nome: string
    phase_slug: string
    ordem: number
    current_count: number
    total_valor: number
    avg_days_in_stage: number
    p75_days_in_stage: number
}

export interface LossReason {
    motivo: string
    count: number
    percentage: number
}

export function useFunnelConversion() {
    const { dateRange, product, mode, stageId, ownerId } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'funnel-conversion', dateRange.start, dateRange.end, product, mode, stageId, ownerId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_funnel_conversion', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_id: ownerId,
            })
            if (error) throw error
            return (data as unknown as FunnelStageData[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useLossReasons() {
    const { dateRange, product, mode, stageId, ownerId } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'loss-reasons', dateRange.start, dateRange.end, product, mode, stageId, ownerId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_loss_reasons', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_id: ownerId,
            })
            if (error) throw error
            return (data as unknown as LossReason[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
