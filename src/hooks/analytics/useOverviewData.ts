import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface OverviewKpis {
    total_leads: number
    total_won: number
    total_lost: number
    total_open: number
    conversao_venda_rate: number
    receita_total: number
    margem_total: number
    ticket_medio: number
    ciclo_medio_dias: number
    viagens_vendidas: number
    taxa_paga_count: number
    taxa_paga_rate: number
    briefing_count: number
    briefing_agendado_rate: number
    proposta_count: number
    proposta_enviada_rate: number
    viagem_confirmada_count: number
    viagem_confirmada_rate: number
}

export interface FunnelStage {
    stage_id: string
    stage_nome: string
    fase: string
    ordem: number
    total_cards: number
    valor_total: number
    receita_total: number
}

export interface RevenuePoint {
    period: string
    period_start: string
    total_valor: number
    total_receita: number
    count_won: number
}

export function useOverviewKpis() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'overview-kpis', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não existe nos types até deploy da migration
            const { data, error } = await (supabase.rpc as any)('analytics_overview_kpis', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return data as unknown as OverviewKpis
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useFunnelData() {
    const { dateRange, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'funnel-snapshot', dateRange.start, dateRange.end, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_funnel_live', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            // RPC already returns sorted by pp.order_index, s.ordem — trust server order
            return (data as unknown as FunnelStage[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}

export function useRevenueTimeseries() {
    const { dateRange, granularity, product, mode, stageId, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'revenue-timeseries', dateRange.start, dateRange.end, granularity, product, mode, stageId, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não existe nos types até deploy da migration
            const { data, error } = await (supabase.rpc as any)('analytics_revenue_timeseries', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_granularity: granularity,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            return (data as unknown as RevenuePoint[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
