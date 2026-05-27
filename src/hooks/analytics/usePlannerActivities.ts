import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PlannerActivity {
  tarefa_id: string
  titulo: string
  tipo: string
  prioridade: string | null
  data_vencimento: string
  dias_atraso?: number
  dias_pra_vencer?: number
  card_id: string
  card_titulo: string
}

export interface PlannerActivitiesResponse {
  vencidas: PlannerActivity[]
  hoje: PlannerActivity[]
  proximos_7d: PlannerActivity[]
  totais: {
    vencidas: number
    hoje: number
    proximos_7d: number
  }
}

export function usePlannerActivities(userId: string | null, limit = 30) {
  return useQuery({
    queryKey: ['analytics', 'planner-activities', userId, limit],
    queryFn: async (): Promise<PlannerActivitiesResponse | null> => {
      if (!userId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('analytics_planner_activities', {
        p_user_id: userId,
        p_limit: limit,
      })
      if (error) throw error
      return data as PlannerActivitiesResponse | null
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  })
}
