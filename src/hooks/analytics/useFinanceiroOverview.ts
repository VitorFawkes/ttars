import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface FinanceiroOverview {
    kpis: {
        qtd: number
        faturamento: number
        receita: number
        margem_pct: number
        ticket_medio: number
    }
    pendente: {
        qtd_pendente: number
        valor_pendente: number
    }
    serie_mensal: Array<{ mes: string; qtd: number; faturamento: number; receita: number }>
    por_origem: Array<{ origem: string; qtd: number; faturamento: number; receita: number; margem_pct: number }>
    por_consultor: Array<{ user_id: string | null; user_nome: string | null; qtd: number; faturamento: number; receita: number }>
}

export function useFinanceiroOverview() {
    const { dateRange, product, dateRef } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'financeiro-overview', dateRange.start, dateRange.end, product, dateRef],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_financeiro_overview', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product,
                p_date_ref: dateRef,
            })
            if (error) throw error
            return (data as unknown as FinanceiroOverview) || null
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}

/**
 * Mesma RPC no período imediatamente ANTERIOR (mesma duração, deslocado pra trás).
 * Usada pelo toggle "Comparar" pra mostrar deltas nos KPIs. Só roda quando `enabled`.
 */
export function useFinanceiroOverviewPrevious(enabled: boolean) {
    const { dateRange, product, dateRef } = useAnalyticsFilters()

    const startMs = new Date(dateRange.start).getTime()
    const endMs = new Date(dateRange.end).getTime()
    const durationMs = endMs - startMs
    const previousEnd = new Date(startMs).toISOString()
    const previousStart = new Date(startMs - durationMs).toISOString()

    return useQuery({
        queryKey: ['analytics', 'financeiro-overview-previous', previousStart, previousEnd, product, dateRef],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('analytics_financeiro_overview', {
                p_date_start: previousStart,
                p_date_end: previousEnd,
                p_product: product,
                p_date_ref: dateRef,
            })
            if (error) throw error
            return (data as unknown as FinanceiroOverview) || null
        },
        staleTime: 60 * 1000,
        retry: 1,
        enabled: enabled && durationMs > 0,
    })
}
