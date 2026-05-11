import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TeamSlaRow {
    user_id: string
    user_nome: string
    total_transicoes: number
    sla_cumpridas: number
    sla_violadas: number
    /** null quando nenhuma transição da pessoa tinha sla_hours configurado */
    compliance_rate: number | null
    tempo_medio_horas: number
}

export function useTeamSlaCompliance() {
    const { dateRange, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-sla', dateRange.start, dateRange.end, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_team_sla_compliance', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as TeamSlaRow[]) || []
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
