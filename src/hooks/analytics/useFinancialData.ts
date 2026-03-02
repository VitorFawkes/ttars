import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface FinancialPeriod {
    period: string
    valor_final_sum: number
    receita_sum: number
    count_won: number
    ticket_medio: number
}

export interface TopDestination {
    destino: string
    total_cards: number
    receita_total: number
}

export interface RevenueByProduct {
    produto: string
    count_won: number
    valor_total: number
    receita_total: number
}

export function useFinancialBreakdown() {
    const { dateRange, granularity, product, mode, stageId, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'financial-breakdown', dateRange.start, dateRange.end, granularity, product, mode, stageId, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_financial_breakdown', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_granularity: granularity,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as FinancialPeriod[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useTopDestinations() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'top-destinations', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_top_destinations', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_limit: 10,
                p_mode: mode,
                p_product: product === 'ALL' ? null : product,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as TopDestination[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useRevenueByProduct() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'revenue-by-product', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_revenue_by_product', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_mode: mode,
                p_product: product === 'ALL' ? null : product,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as RevenueByProduct[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
