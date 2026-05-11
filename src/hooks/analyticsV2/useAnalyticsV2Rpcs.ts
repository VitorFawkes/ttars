import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { useAnalyticsV2Filters, getRpcFilters, getRpcFiltersV1 } from './useAnalyticsV2Filters'

function useFilters() {
  return useAnalyticsV2Filters(useShallow(getRpcFilters))
}

function useFiltersV1() {
  return useAnalyticsV2Filters(useShallow(getRpcFiltersV1))
}

// ========== Fase 1 _v2 (já em prod, dialeto p_date_start/p_date_end) ==========

export function useOverviewKpisV2() {
  const f = useFiltersV1()
  return useQuery({
    queryKey: ['av2', 'overview_kpis_v2', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_overview_kpis_v2', f as never)
      if (error) throw error
      return data as Record<string, number | null>
    },
    staleTime: 60_000,
  })
}

export function useRevenueTimeseriesV2() {
  const f = useFiltersV1()
  return useQuery({
    queryKey: ['av2', 'revenue_timeseries_v2', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_revenue_timeseries_v2', { ...f, p_granularity: 'month' } as never)
      if (error) throw error
      return (data ?? []) as Array<{
        period: string
        period_start: string
        total_valor: number
        total_receita: number
        count_won: number
      }>
    },
    staleTime: 60_000,
  })
}

export function useFunnelConversionV2() {
  const f = useFiltersV1()
  return useQuery({
    queryKey: ['av2', 'funnel_conversion_v2', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_funnel_conversion_v2', f as never)
      if (error) throw error
      return (data ?? []) as Array<{
        stage_id: string
        stage_nome: string
        phase_slug: string
        ordem: number
        current_count: number
        total_valor: number
        receita_total: number
        avg_days_in_stage: number
        p75_days_in_stage: number
      }>
    },
    staleTime: 60_000,
  })
}

export function useTopDestinationsV2() {
  const f = useFiltersV1()
  return useQuery({
    queryKey: ['av2', 'top_destinations_v2', f],
    queryFn: async () => {
      const payload = {
        p_date_start: f.p_date_start.slice(0, 10),
        p_date_end: f.p_date_end.slice(0, 10),
        p_limit: 10,
        p_product: f.p_product,
        p_owner_id: f.p_owner_id,
        p_owner_ids: f.p_owner_ids,
        p_tag_ids: f.p_tag_ids,
        p_origem: f.p_origem,
        p_phase_slugs: f.p_phase_slugs,
        p_lead_entry_path: f.p_lead_entry_path,
        p_destinos: f.p_destinos,
      }
      const { data, error } = await supabase.rpc('analytics_top_destinations_v2', payload as never)
      if (error) throw error
      return (data ?? []) as Array<{ destino: string; total_cards: number; receita_total: number }>
    },
    staleTime: 120_000,
  })
}

// ========== Fase 2 novas (Bloco 3) ==========

export function useStageConversion() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'stage_conversion', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_stage_conversion', f as never)
      if (error) throw error
      return (data as { stages: Array<{ stage_id: string; stage_name: string; ordem: number; entered: number; advanced: number; conversion_pct: number }> } | null)?.stages ?? []
    },
    staleTime: 60_000,
  })
}

export function useReworkRate() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'rework_rate', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_rework_rate', f as never)
      if (error) throw error
      return data as { total_moved: number; rework_count: number; rework_pct: number; by_phase: Array<{ phase_slug: string; phase_label: string; rework_cards: number }> } | null
    },
    staleTime: 60_000,
  })
}

export function useTaskCompletionByPerson() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'task_completion_by_person', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_task_completion_by_person', f as never)
      if (error) throw error
      return (data as { people: Array<Record<string, unknown>> } | null)?.people ?? []
    },
    staleTime: 60_000,
  })
}

export function useCadenceCompliance() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'cadence_compliance', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_cadence_compliance', f as never)
      if (error) throw error
      return data as { overall: Record<string, number | null>; by_template: Array<Record<string, unknown>> } | null
    },
    staleTime: 60_000,
  })
}

export function useFieldCompleteness(ctx: 'sdr' | 'vendas' | 'pos' | 'dono' = 'dono') {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'field_completeness', f, ctx],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_field_completeness', { ...f, p_ctx: ctx } as never)
      if (error) throw error
      return data as {
        overall_avg_score: number
        total_cards: number
        by_person: Array<{ user_id: string; user_name: string; cards: number; avg_score: number }>
        by_phase: Array<{ phase_slug: string; phase_label: string; cards: number; avg_score: number }>
        by_person_phase: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useLeadEntryPathBreakdown() {
  const f = useFilters()
  const { p_lead_entry_path: _unused, ...filtered } = f
  void _unused
  return useQuery({
    queryKey: ['av2', 'lead_entry_path_breakdown', filtered],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_lead_entry_path_breakdown', filtered as never)
      if (error) throw error
      return (data as { paths: Array<{ entry_path: string; total_leads: number; wins: number; conversion_pct: number; total_revenue: number; avg_ticket: number; avg_days_to_win: number | null }> } | null)?.paths ?? []
    },
    staleTime: 60_000,
  })
}

export function useTripReadiness() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'trip_readiness', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_trip_readiness', {
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_phase_slugs: f.p_phase_slugs,
        p_destinos: f.p_destinos,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        summary: { total_trips: number; at_risk: number; avg_readiness_pct: number | null; fully_ready: number }
        trips: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useProposalVersions() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'proposal_versions', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_proposal_versions', {
        p_from: f.p_from, p_to: f.p_to, p_product: f.p_product,
        p_origem: f.p_origem, p_destinos: f.p_destinos, p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        summary: Record<string, number | null>
        by_planner: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 120_000,
  })
}

export function useHandoffSpeed() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'handoff_speed', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_handoff_speed', {
        p_from: f.p_from, p_to: f.p_to, p_product: f.p_product,
        p_origem: f.p_origem, p_destinos: f.p_destinos,
      } as never)
      if (error) throw error
      return data as {
        summary: Record<string, number | null>
        by_pair: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useWhatsappSpeedV2() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'whatsapp_speed_v2', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_whatsapp_speed_v2', f as never)
      if (error) throw error
      return data as {
        overall: Record<string, number | null>
        by_source: Array<Record<string, unknown>>
        buckets: Array<{ bucket: string; count: number }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useDroppedBalls(thresholdBusinessMinutes = 240) {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'dropped_balls', f, thresholdBusinessMinutes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_dropped_balls', {
        p_threshold_business_minutes: thresholdBusinessMinutes,
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_phase_slugs: f.p_phase_slugs,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        summary: { total_dropped: number; avg_waiting_hours?: number | null; oldest_waiting_hours?: number | null }
        cards: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 30_000,
  })
}

export function useCardStageHistory(cardId: string | null) {
  return useQuery({
    queryKey: ['av2', 'card_stage_history', cardId],
    queryFn: async () => {
      if (!cardId) return null
      const { data, error } = await supabase.rpc('fn_card_stage_history', { p_card_id: cardId } as never)
      if (error) throw error
      return data as { card_id: string; events: Array<{ at: string; kind: string; payload: Record<string, unknown> }> } | null
    },
    enabled: !!cardId,
    staleTime: 30_000,
  })
}

// ========== Comercial Dashboard (migration 20260421i) ==========
// TODO: remover cast `rpcComercial` quando tipos forem regenerados pós-promoção em prod
const rpcComercial = (supabase.rpc as unknown) as (fn: string, args?: unknown) => ReturnType<typeof supabase.rpc>

export function useForecastPonderado() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'forecast_ponderado', f],
    queryFn: async () => {
      const { data, error } = await rpcComercial('analytics_forecast_ponderado', f)
      if (error) throw error
      return data as {
        forecast_30d: number | null
        forecast_60d: number | null
        forecast_90d: number | null
        by_stage: Array<Record<string, unknown>>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useLossReasonsV2() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'loss_reasons_v2', f],
    queryFn: async () => {
      const { data, error } = await rpcComercial('analytics_loss_reasons_v2', f)
      if (error) throw error
      return data as {
        reasons: Array<{ reason: string; count: number; total_valor: number }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useConversionByTicket() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'conversion_by_ticket', f],
    queryFn: async () => {
      const { data, error } = await rpcComercial('analytics_conversion_by_ticket', f)
      if (error) throw error
      return data as {
        data: Array<{
          source: string
          total: number
          won: number
          conversion_pct: number
          avg_ticket: number
        }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useStageVelocityPercentiles() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'stage_velocity_percentiles', f],
    queryFn: async () => {
      const { data, error } = await rpcComercial('analytics_stage_velocity_percentiles', f)
      if (error) throw error
      return data as {
        stages: Array<{
          stage_id: string
          stage_name: string
          card_count: number
          p50_days: number
          p75_days: number
        }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useQualityScoreV2(ctx: 'sdr' | 'vendas' | 'pos' | 'dono' | 'comercial' = 'dono') {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'quality_score_v2', f, ctx],
    queryFn: async () => {
      const { data, error } = await rpcComercial('analytics_quality_score_v2', { ...f, p_ctx: ctx })
      if (error) throw error
      return data as {
        overall_avg_score: number | null
        high_quality_count: number
        high_quality_pct: number | null
        total_cards: number
      } | null
    },
    staleTime: 60_000,
  })
}
