import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { useAnalyticsV2Filters, getRpcFilters } from './useAnalyticsV2Filters'

// TODO: remover cast quando `npx supabase gen types` rodar com as RPCs da migration 20260425d em prod
const rpc = (supabase.rpc as unknown) as (fn: string, args?: unknown) => ReturnType<typeof supabase.rpc>

function useFilters() {
  return useAnalyticsV2Filters(useShallow(getRpcFilters))
}

// ========== Pós-Venda Dashboard RPCs ==========

export function useUpcomingDepartures() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'upcoming_departures', f],
    queryFn: async () => {
      const { data, error } = await rpc('analytics_upcoming_departures', {
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_destinos: f.p_destinos,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        next_7_days: number
        next_14_days: number
        next_30_days: number
      } | null
    },
    staleTime: 60_000,
  })
}

export function useCompletedTrips() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'completed_trips', f],
    queryFn: async () => {
      const { data, error } = await rpc('analytics_completed_trips', {
        p_from: f.p_from,
        p_to: f.p_to,
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_destinos: f.p_destinos,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        summary: {
          total_completed: number
          avg_trips_per_concierge: number | null
        }
        by_concierge: Array<{
          concierge_id: string | null
          concierge_name: string
          completed_count: number
        }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useTripTimeToReady() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'trip_time_to_ready', f],
    queryFn: async () => {
      const { data, error } = await rpc('analytics_trip_time_to_ready', {
        p_from: f.p_from,
        p_to: f.p_to,
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_destinos: f.p_destinos,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return data as {
        summary: {
          trips_measured: number
          median_days: number | null
          p75_days: number | null
          avg_days: number | null
        }
        by_concierge: Array<{
          concierge_id: string | null
          concierge_name: string
          trips_measured: number
          median_days: number | null
          p75_days: number | null
        }>
      } | null
    },
    staleTime: 60_000,
  })
}

export function useBottleneckByItem() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'bottleneck_by_item', f],
    queryFn: async () => {
      const { data, error } = await rpc('analytics_bottleneck_by_item', {
        p_from: f.p_from,
        p_to: f.p_to,
        p_product: f.p_product,
        p_origem: f.p_origem,
        p_destinos: f.p_destinos,
        p_owner_id: f.p_owner_id,
      } as never)
      if (error) throw error
      return (data ?? []) as Array<{
        item_type: string
        total_items: number
        avg_days_to_ready: number | null
        median_days_to_ready: number | null
      }>
    },
    staleTime: 60_000,
  })
}

export function useReferralsPostTrip() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'referrals_post_trip', f],
    queryFn: async () => {
      const { data, error } = await rpc('analytics_referrals_post_trip', {
        p_from: f.p_from,
        p_to: f.p_to,
        p_product: f.p_product,
      } as never)
      if (error) throw error
      return data as {
        summary: {
          total_referrals: number
          avg_days_after_ganho: number | null
          median_days_after_ganho: number | null
        }
        by_referrer: Array<{
          referrer_contact_id: string | null
          referrer_name: string
          referred_count: number
          avg_days_after_ganho: number | null
        }>
      } | null
    },
    staleTime: 120_000,
  })
}
