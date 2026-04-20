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

// Frontend usa slugs lowercase ('sdr' | 'planner' | 'pos_venda') mas a RPC
// legacy analytics_team_performance filtra case-sensitive por 'SDR' | 'Vendas' | 'Pos-Venda'.
// Converte aqui pra não exigir patch na RPC.
const PHASE_RPC_LABEL: Record<string, string> = {
    sdr: 'SDR',
    planner: 'Vendas',
    pos_venda: 'Pos-Venda',
}

export function useTeamPerformance(phase?: string) {
    const { dateRange, product, mode, stageId, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'team-performance', dateRange.start, dateRange.end, product, phase, mode, stageId, ownerIds, tagIds],
        queryFn: async () => {
            const rpcPhase = phase ? (PHASE_RPC_LABEL[phase] ?? phase) : null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova, não existe nos types até deploy
            const { data, error } = await (supabase.rpc as any)('analytics_team_performance', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product,
                p_phase: rpcPhase,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as TeamMember[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
