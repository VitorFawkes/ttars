import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TeamIndividualMonthRow {
    mes: string // ISO date (1º dia do mês)
    cards_ganhos: number
    cards_perdidos: number
    cards_envolvidos: number
    win_rate: number // 0-100
    receita_total: number
    ticket_medio: number
    ciclo_medio_dias: number
}

export function useTeamIndividualEvolution(userId: string | null, months: number = 6) {
    return useQuery({
        queryKey: ['analytics', 'team-individual-evolution', userId, months],
        queryFn: async () => {
            if (!userId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_individual_evolution', {
                p_user_id: userId,
                p_months: months,
            })
            if (error) throw error
            return (data as unknown as TeamIndividualMonthRow[]) || []
        },
        enabled: !!userId,
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
