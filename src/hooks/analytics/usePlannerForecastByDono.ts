import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface ForecastCardSummary {
  id: string
  titulo: string
  valor: number
}

export interface ForecastByDonoRow {
  planner_id: string
  planner_nome: string
  data_prevista: string  // YYYY-MM-DD
  qtd: number
  valor: number
  cards: ForecastCardSummary[]
}

export interface ForecastFilters {
  /** Início da janela. ISO date string YYYY-MM-DD. Default = hoje */
  dateStart: string
  /** Fim da janela. ISO date string YYYY-MM-DD. Default = hoje + 30d */
  dateEnd: string
  /** Lista de Planners. Vazio = todos */
  ownerIds: string[]
  /** Faixa de valor. null = sem limite */
  valueMin: number | null
  valueMax: number | null
}

export function usePlannerForecastByDono(filters: ForecastFilters) {
  const { product } = useAnalyticsFilters()

  return useQuery({
    queryKey: ['analytics', 'planner-forecast-by-dono',
      filters.dateStart, filters.dateEnd, filters.ownerIds, filters.valueMin, filters.valueMax, product],
    queryFn: async (): Promise<ForecastByDonoRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_forecast_by_dono', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_owner_ids: filters.ownerIds.length > 0 ? filters.ownerIds : null,
        p_value_min: filters.valueMin,
        p_value_max: filters.valueMax,
        p_product: product,
      })
      if (error) throw error
      return (data as ForecastByDonoRow[]) ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}
