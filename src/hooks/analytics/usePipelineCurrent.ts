import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──────────────────────────────────────────────

export type DateRef = 'stage' | 'created'

export interface PipelineCurrentKpis {
    total_open: number
    total_value: number
    total_receita: number
    avg_ticket: number
    avg_receita_ticket: number
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
    receita_total: number
    avg_days: number
    sla_breach_count: number
}

export interface PipelineCurrentAging {
    stage_id: string
    stage_nome: string
    fase: string
    fase_slug: string
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
    total_receita: number
    avg_age_days: number
    sla_breach: number
    by_phase: { sdr: number; planner: number; 'pos-venda': number }
    by_phase_value: { sdr: number; planner: number; 'pos-venda': number }
    by_phase_receita: { sdr: number; planner: number; 'pos-venda': number }
}

export interface PipelineCurrentDeal {
    card_id: string
    titulo: string
    stage_nome: string
    fase: string
    fase_slug: string
    owner_nome: string
    owner_id: string | null
    valor_total: number
    receita: number
    days_in_stage: number
    sla_hours: number | null
    is_sla_breach: boolean
    pessoa_nome: string | null
}

export interface PipelineTaskByType {
    tipo: string
    total: number
    completed: number
    pending: number
    overdue: number
}

export interface PipelineTaskByStage {
    stage_id: string
    stage_nome: string
    fase: string
    fase_slug: string
    card_count: number
    total: number
    completed: number
    pending: number
    overdue: number
}

export interface PipelineTaskByOwner {
    owner_id: string | null
    owner_nome: string
    card_count: number
    total: number
    completed: number
    pending: number
    overdue: number
}

export interface PipelineCurrentTasks {
    total_created: number
    total_completed: number
    total_pending: number
    total_overdue: number
    completion_rate: number
    by_type: PipelineTaskByType[]
    by_stage: PipelineTaskByStage[]
    by_owner: PipelineTaskByOwner[]
}

export interface PipelineCurrentData {
    kpis: PipelineCurrentKpis
    stages: PipelineCurrentStage[]
    aging: PipelineCurrentAging[]
    owners: PipelineCurrentOwner[]
    top_deals: PipelineCurrentDeal[]
    tasks: PipelineCurrentTasks
}

// ── Hook Options ────────────────────────────────────────

interface UsePipelineCurrentOptions {
    dateRef?: DateRef
    valueMin?: number | null
    valueMax?: number | null
}

// ── Hook ───────────────────────────────────────────────

export function usePipelineCurrent(options?: UsePipelineCurrentOptions) {
    const { product, ownerIds, tagIds } = useAnalyticsFilters()
    const dateRef = options?.dateRef ?? 'stage'
    const valueMin = options?.valueMin ?? null
    const valueMax = options?.valueMax ?? null

    return useQuery({
        queryKey: ['analytics', 'pipeline-current', product, ownerIds, tagIds, dateRef, valueMin, valueMax],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)(
                'analytics_pipeline_current',
                {
                    p_product: product,
                    p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                    p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
                    p_date_ref: dateRef,
                    p_value_min: valueMin,
                    p_value_max: valueMax,
                }
            )
            if (error) throw error
            return data as unknown as PipelineCurrentData
        },
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
