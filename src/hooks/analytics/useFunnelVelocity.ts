import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface FunnelVelocityRow {
    stage_id: string
    stage_nome: string
    phase_slug: string | null
    ordem: number
    cards_passaram: number
    cards_atuais: number
    mediana_dias: number
    p90_dias: number
    media_dias: number
}

export function useFunnelVelocity() {
    const { dateRange, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'funnel-velocity', dateRange.start, dateRange.end, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_funnel_velocity', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as FunnelVelocityRow[]) || []
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
