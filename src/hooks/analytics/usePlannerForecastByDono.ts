import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface ForecastCard {
  card_id: string
  card_titulo: string
  valor: number
  data_prevista: string  // YYYY-MM-DD
  planner_id: string
  planner_nome: string
  origem: string
  stage_id: string | null
  stage_nome: string | null
  phase_slug: string | null
  destino: string
}

export interface ForecastFilters {
  dateStart: string         // YYYY-MM-DD
  dateEnd: string
  ownerIds: string[]
  valueMin: number | null
  valueMax: number | null
  origens: string[]
  stageIds: string[]
}

export function usePlannerForecastByDono(filters: ForecastFilters) {
  const { product } = useAnalyticsFilters()

  return useQuery({
    queryKey: ['analytics', 'planner-forecast-by-dono-v2',
      filters.dateStart, filters.dateEnd, filters.ownerIds, filters.valueMin, filters.valueMax,
      filters.origens, filters.stageIds, product],
    queryFn: async (): Promise<ForecastCard[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_forecast_by_dono', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_owner_ids: filters.ownerIds.length > 0 ? filters.ownerIds : null,
        p_value_min: filters.valueMin,
        p_value_max: filters.valueMax,
        p_origens: filters.origens.length > 0 ? filters.origens : null,
        p_stage_ids: filters.stageIds.length > 0 ? filters.stageIds : null,
        p_product: product,
      })
      if (error) throw error
      return (data as ForecastCard[]) ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}
