import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface StageXOwnerRow {
  stage_id: string
  stage_nome: string
  phase_slug: string
  stage_ordem: number
  phase_order: number
  planner_id: string
  planner_nome: string
  tempo_medio_dias: number
  tempo_pior_dias: number
  cards_passaram: number
  cards_atuais: number
}

export interface StageXOwnerFilters {
  dateStart: string  // ISO timestamptz
  dateEnd: string
  stageIds: string[]
  ownerIds: string[]
}

export function usePlannerStageXOwner(filters: StageXOwnerFilters) {
  const { product } = useAnalyticsFilters()

  return useQuery({
    queryKey: ['analytics', 'planner-stage-x-owner',
      filters.dateStart, filters.dateEnd, filters.stageIds, filters.ownerIds, product],
    queryFn: async (): Promise<StageXOwnerRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_stage_x_owner', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_stage_ids: filters.stageIds.length > 0 ? filters.stageIds : null,
        p_owner_ids: filters.ownerIds.length > 0 ? filters.ownerIds : null,
        p_product: product,
      })
      if (error) throw error
      return (data as StageXOwnerRow[]) ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}
