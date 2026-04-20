import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TeamLeaderboardRow {
    user_id: string
    user_nome: string
    user_avatar_url: string | null
    fases: string[]
    cards_envolvidos: number
    cards_ganhos: number
    cards_perdidos: number
    cards_abertos: number
    win_rate: number
    receita_total: number
    ticket_medio: number
    tarefas_abertas: number
    tarefas_vencidas: number
}

export function useTeamLeaderboard() {
    const { dateRange, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-leaderboard', dateRange.start, dateRange.end, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_leaderboard', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as TeamLeaderboardRow[]) || []
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
