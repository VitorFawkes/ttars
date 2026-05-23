import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TeamTicketVariationRow {
    user_id: string
    user_nome: string
    cards_ganhos: number
    ticket_min: number
    ticket_medio: number
    ticket_max: number
    receita_total: number
}

export function useTeamTicketVariation() {
    const { dateRange, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-ticket-variation', dateRange.start, dateRange.end, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_ticket_variation', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as TeamTicketVariationRow[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
