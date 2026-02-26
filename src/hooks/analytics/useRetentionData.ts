import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface RetentionCohortRow {
    cohort_month: string
    month_offset: number
    total_contacts: number
    retained: number
    retention_rate: number
}

export interface RetentionKpis {
    total_with_purchase: number
    repeat_buyers: number
    churned: number
    repurchase_rate: number
    churn_rate: number
}

export function useRetentionCohort() {
    const { dateRange, product } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'retention-cohort', dateRange.start, dateRange.end, product],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_retention_cohort', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
            })
            if (error) throw error
            return (data as unknown as RetentionCohortRow[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useRetentionKpis() {
    const { dateRange, product } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'retention-kpis', dateRange.start, dateRange.end, product],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_retention_kpis', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
            })
            if (error) throw error
            return (data as unknown as RetentionKpis) || null
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
