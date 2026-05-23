import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface ConciergeOverview {
    kpis: {
        total: number
        feitos: number
        cancelados: number
        pendentes: number
        tempo_medio_resolucao_horas: number
    }
    cobertura: {
        cards_pos_venda: number
        cards_com_atendimento: number
    }
    por_tipo: Array<{ tipo: string; qtd: number; feitos: number }>
    por_categoria: Array<{ categoria: string; qtd: number }>
    volume_mensal: Array<{ mes: string; qtd: number }>
    por_concierge: Array<{
        user_id: string | null
        user_nome: string | null
        atendimentos: number
        feitos: number
        pendentes: number
        tempo_medio_h: number
    }>
}

export function useConciergeOverview() {
    const { dateRange } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'concierge-overview', dateRange.start, dateRange.end],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_concierge_overview', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
            })
            if (error) throw error
            return (data as unknown as ConciergeOverview) || null
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}

export interface ConciergePendenteRow {
    atendimento_id: string
    card_id: string
    card_titulo: string
    tipo_concierge: string
    categoria: string
    origem_descricao: string | null
    concierge_nome: string | null
    created_at: string
    horas_aberto: number
    total_count: number
}

export function useConciergePendentes() {
    return useQuery({
        queryKey: ['analytics', 'concierge-pendentes'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_concierge_pendentes', {
                p_limit: 50,
            })
            if (error) throw error
            const rows = (data as unknown as ConciergePendenteRow[]) || []
            return {
                rows,
                totalCount: rows[0]?.total_count ?? 0,
            }
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}
