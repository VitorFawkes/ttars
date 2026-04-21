import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { useAnalyticsV2Filters, getRpcFiltersV1 } from './useAnalyticsV2Filters'

function useFilters() {
  return useAnalyticsV2Filters(useShallow(getRpcFiltersV1))
}

// ========== Vendas Dashboard RPCs (7 widgets) ==========

export function useTripStates() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'trip_states', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_trip_states', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        by_estado: Record<string, { count: number; latest_at: string }>
        total_trips: number
      } | null
    },
    staleTime: 60_000,
  })
}

export function usePostIssues() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'post_issues', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_post_issues', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        total_closed: number
        with_issues: number
        issue_pct: number | null
      } | null
    },
    staleTime: 60_000,
  })
}

export function useReturnCustomers() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'return_customers', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_return_customers', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return data as {
        total_returning: number
        avg_repeat_count: number | null
        avg_days_to_repeat: number | null
        total_repeat_revenue: number | null
      } | null
    },
    staleTime: 60_000,
  })
}

export function usePlannerOpenPortfolio() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'planner_open_portfolio', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_planner_open_portfolio', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return (data as {
        planners: Array<{
          planner_id: string
          planner_name: string
          open_count: number
          total_estimado: number
          avg_days_open: number | null
        }>
      } | null)?.planners ?? []
    },
    staleTime: 60_000,
  })
}

export function useOverdueTasksByOwner() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'overdue_tasks_by_owner', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_overdue_tasks_by_owner', {
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return (data as {
        tasks: Array<{
          owner_id: string
          owner_name: string
          overdue_count: number
          oldest_overdue_days: number | null
          average_overdue_days: number | null
        }>
      } | null)?.tasks ?? []
    },
    staleTime: 30_000,
  })
}

export function useLossReasonsByPlanner() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'loss_reasons_by_planner', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_loss_reasons_by_planner', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return (data as {
        planners: Array<{
          planner_id: string
          planner_name: string
          reasons: Record<string, number>
          total_lost: number
        }>
      } | null)?.planners ?? []
    },
    staleTime: 60_000,
  })
}

export function useProposalToWinVelocity() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'proposal_to_win_velocity', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_proposal_to_win_velocity', {
        p_from: f.p_date_start.slice(0, 10),
        p_to: f.p_date_end.slice(0, 10),
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return (data as {
        planners: Array<{
          planner_id: string
          planner_name: string
          median_days: number | null
          p75_days: number | null
          sample_count: number
        }>
      } | null)?.planners ?? []
    },
    staleTime: 60_000,
  })
}
