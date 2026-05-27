import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface PlannerProfileHeader {
  user_id: string
  nome: string
  avatar_url: string | null
  role: string
  rank_position: number
}

export interface PlannerStageDist {
  stage_id: string
  stage_nome: string
  phase_slug: string
  qtd: number
}

export interface PlannerProfileAgora {
  cards_abertos: number
  em_risco: number
  atendimentos_semana: number
  delta_semana: number
  por_etapa: PlannerStageDist[]
}

export interface PlannerProfilePeriodo {
  ganhos: number
  perdidos: number
  faturamento: number
  receita: number
  ticket_medio: number
  win_rate: number
  win_rate_team: number
  dias_ate_ganho: number
  dias_ate_ganho_pior: number
  dias_ate_perda: number
  dias_ate_ganho_team: number
}

export interface PlannerProfilePreenchimento {
  sem_briefing: number
  sem_contato: number
  parados_14d: number
  total_abertos: number
}

export interface PlannerProfileMotivo {
  motivo: string | null
  qtd: number
}

export interface PlannerProfileOrigem {
  origem: string
  leads: number
  pct: number
}

export interface PlannerProfileForecast {
  prox_7d_qtd: number
  prox_7d_valor: number
  prox_30d_qtd: number
  prox_30d_valor: number
}

export interface PlannerProfile {
  header: PlannerProfileHeader
  agora: PlannerProfileAgora
  periodo: PlannerProfilePeriodo
  preenchimento: PlannerProfilePreenchimento
  motivos_perda: PlannerProfileMotivo[]
  origens: PlannerProfileOrigem[]
  forecast: PlannerProfileForecast
}

export function usePlannerProfile(userId: string | null) {
  const { dateRange, product } = useAnalyticsFilters()

  return useQuery({
    queryKey: ['analytics', 'planner-profile', userId, dateRange.start, dateRange.end, product],
    queryFn: async (): Promise<PlannerProfile | null> => {
      if (!userId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_profile', {
        p_user_id: userId,
        p_date_start: dateRange.start,
        p_date_end: dateRange.end,
        p_product: product,
      })
      if (error) throw error
      return data as PlannerProfile | null
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}
