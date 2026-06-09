import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface RetencaoCohort {
    kpis: {
        clientes_novos_periodo: number
        clientes_que_voltaram: number
        ticket_medio_novo: number
        ticket_medio_repeat: number
    }
    cohort_table: Array<{
        cohort_mes: string
        tamanho: number
        retornaram: number
        taxa_retorno: number
    }>
    tempo_para_voltar: Array<{ bucket: string; qtd: number }>
    top_repeats: Array<{
        cliente_id: string
        cliente_nome: string | null
        total_viagens: number
        lifetime_value: number
    }>
}

export function useRetencaoCohort(monthsBack: number = 12) {
    const { product, ownerIds, origins } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'retencao-cohort', monthsBack, product, ownerIds, origins],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_retencao_cohort', {
                p_months_back: monthsBack,
                p_product: product,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_origens: origins.length > 0 ? origins : undefined,
            })
            if (error) throw error
            return (data as unknown as RetencaoCohort) || null
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
