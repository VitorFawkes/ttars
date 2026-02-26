import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TeamMember {
    user_id: string
    user_nome: string
    phase: string
    total_cards: number
    won_cards: number
    lost_cards: number
    open_cards: number
    conversion_rate: number
    total_receita: number
    ticket_medio: number
    ciclo_medio_dias: number
    active_cards: number
}

export function useTeamPerformance(phase?: string) {
    const { dateRange, product, mode, stageId, ownerId } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-performance', dateRange.start, dateRange.end, product, phase, mode, stageId, ownerId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova, não existe nos types até deploy
            const { data, error } = await (supabase.rpc as any)('analytics_team_performance', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_phase: phase || null,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_id: ownerId,
            })
            if (error) throw error
            return (data as unknown as TeamMember[]) || []
        },
        retry: 1,
    })
}
