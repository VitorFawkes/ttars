import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface SdrCohortMonth {
  cohort_mes: string // YYYY-MM-DD (1º do mês)
  leads: number
  ganhos: number
  perdidos: number
  abertos: number
  qualificados_sdr: number
  ganhos_valor: number
  conv_pct: number
  mediana_dias_ganho: number | null
}

export interface SdrCohortOrigem {
  origem: string
  leads: number
  ganhos: number
  ganhos_valor: number
  conv_pct: number
}

export interface SdrCohortTempo {
  mesmo_dia: number
  d1_7: number
  d7_30: number
  d30_60: number
  d60_90: number
  d90_mais: number
}

export interface SdrLeadCohortResponse {
  kpis: {
    total_leads: number
    total_ganhos: number
    total_perdidos: number
    total_abertos: number
    conv_pct: number
    mediana_dias_ganho: number | null
  }
  cohort: SdrCohortMonth[]
  tempo_buckets: SdrCohortTempo
  por_origem: SdrCohortOrigem[]
}

/**
 * Evolução dos leads (jornada SDR → venda) por coorte de entrada.
 * Janela fixa de `monthsBack` meses (default 6) — coorte é sobre histórico de entrada,
 * independente do filtro de período da página. Respeita produto, owners e origens da página.
 */
export function useSdrLeadCohort(monthsBack = 6) {
  const { product, ownerIds, origins } = useAnalyticsFilters()
  const start = new Date()
  start.setMonth(start.getMonth() - monthsBack)
  const dateStart = start.toISOString()
  const dateEnd = new Date().toISOString()

  return useQuery({
    queryKey: ['analytics', 'sdr_lead_cohort', dateStart.slice(0, 7), product, ownerIds, origins],
    queryFn: async (): Promise<SdrLeadCohortResponse | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
      const { data, error } = await (supabase.rpc as any)('analytics_sdr_lead_cohort', {
        p_date_start: dateStart,
        p_date_end: dateEnd,
        p_product: product,
        p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
        p_origens: origins.length > 0 ? origins : undefined,
      })
      if (error) throw error
      return (data as SdrLeadCohortResponse) ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}
