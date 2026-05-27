import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface ResumoOverview {
    empresa: {
        kpis: {
            ganhos: number
            faturamento: number
            receita: number
            ticket_medio: number
            leads_entrada: number
            conversao_geral: number
        }
        sparkline: Array<{ mes: string; ganhos: number; faturamento: number }>
    }
    por_time: Array<{ fase: string; cards_abertos: number; valor_pipeline: number }>
    tarefas_time: Array<{ fase: string; feitas: number; vencidas: number; pendentes: number }>
    por_origem: Array<{ origem: string; leads: number; ganhos: number; faturamento: number }>
    snapshot_fases: Array<{ fase: string; qtd: number }>
    forecast: {
        qtd_prevista: number
        valor_previsto: number
        qtd_prox_7d: number
        valor_prox_7d: number
    }
}

export function useResumoOverview() {
    const { dateRange, product } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'resumo-overview', dateRange.start, dateRange.end, product],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_resumo_overview', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product,
            })
            if (error) throw error
            return (data as unknown as ResumoOverview) || null
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}

/**
 * Mesma RPC chamada com o período imediatamente ANTERIOR ao atual (mesma duração,
 * deslocado pra trás). Útil pra calcular delta semana-vs-semana, mês-vs-mês etc.
 */
export function useResumoOverviewPrevious() {
    const { dateRange, product } = useAnalyticsFilters()

    const startMs = new Date(dateRange.start).getTime()
    const endMs = new Date(dateRange.end).getTime()
    const durationMs = endMs - startMs
    const previousEnd = new Date(startMs).toISOString()
    const previousStart = new Date(startMs - durationMs).toISOString()

    return useQuery({
        queryKey: ['analytics', 'resumo-overview-previous', previousStart, previousEnd, product],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('analytics_resumo_overview', {
                p_date_start: previousStart,
                p_date_end: previousEnd,
                p_product: product,
            })
            if (error) throw error
            return (data as unknown as ResumoOverview) || null
        },
        staleTime: 60 * 1000,
        retry: 1,
        enabled: durationMs > 0,
    })
}
