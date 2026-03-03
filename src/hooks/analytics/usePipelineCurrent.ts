import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──────────────────────────────────────────────

export interface PipelineCurrentKpis {
    total_open: number
    total_value: number
    avg_ticket: number
    avg_age_days: number
    sla_breach_count: number
    sla_breach_pct: number
}

export interface PipelineCurrentStage {
    stage_id: string
    stage_nome: string
    fase: string
    fase_slug: string
    produto: string | null
    ordem: number
    card_count: number
    valor_total: number
    avg_days: number
    sla_breach_count: number
}

export interface PipelineCurrentAging {
    stage_id: string
    stage_nome: string
    fase: string
    bucket_0_3: number
    bucket_3_7: number
    bucket_7_14: number
    bucket_14_plus: number
}

export interface PipelineCurrentOwner {
    owner_id: string | null
    owner_nome: string
    total_cards: number
    total_value: number
    avg_age_days: number
    sla_breach: number
    by_phase: { sdr: number; planner: number; 'pos-venda': number }
}

export interface PipelineCurrentDeal {
    card_id: string
    titulo: string
    stage_nome: string
    fase: string
    owner_nome: string
    owner_id: string | null
    valor_total: number
    days_in_stage: number
    sla_hours: number | null
    is_sla_breach: boolean
    pessoa_nome: string | null
}

export interface PipelineCurrentData {
    kpis: PipelineCurrentKpis
    stages: PipelineCurrentStage[]
    aging: PipelineCurrentAging[]
    owners: PipelineCurrentOwner[]
    top_deals: PipelineCurrentDeal[]
}

// ── Hook ───────────────────────────────────────────────

export function usePipelineCurrent() {
    const { product, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'pipeline-current', product, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)(
                'analytics_pipeline_current',
                {
                    p_product: product === 'ALL' ? null : product,
                    p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                    p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
                }
            )
            if (error) throw error
            return data as unknown as PipelineCurrentData
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
