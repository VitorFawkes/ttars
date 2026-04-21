import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { useAnalyticsV2Filters, getRpcFilters } from './useAnalyticsV2Filters'

function useFilters() {
  return useAnalyticsV2Filters(useShallow(getRpcFilters))
}

// ========== Types ==========

export interface SdrFollowThroughResponse {
  total_handoffs: number
  handoffs_won: number
  follow_through_pct: number
  by_sdr: Array<{
    sdr_id: string | null
    sdr_name: string | null
    total: number
    won: number
    follow_through_pct: number
  }>
}

export interface SdrAvgTicketResponse {
  total_sold_cards: number
  total_revenue: number
  avg_ticket: number
  by_sdr: Array<{
    sdr_id: string | null
    sdr_name: string | null
    total_sold: number
    total_revenue: number
    avg_ticket: number
  }>
}

export interface SdrMeetingsResponse {
  meetings_scheduled: number
  meetings_completed: number
  meetings_no_show: number
  completion_rate_pct: number
  no_show_rate_pct: number
  by_sdr: Array<{
    sdr_id: string | null
    sdr_name: string | null
    scheduled: number
    completed: number
    no_show: number
    completion_rate: number
  }>
}

export interface SdrLeadsBySourceResponse {
  total_leads: number
  sources: Array<{
    source: string
    total: number
    won: number
    conversion_pct: number
  }>
}

export interface SdrSlaComplianceResponse {
  total_messages: number
  under_5min_pct: number
  under_1h_pct: number
  under_5h_pct: number
  over_5h_pct: number
  buckets: {
    under_5min: { label: string; count: number; pct: number }
    '5min_1h': { label: string; count: number; pct: number }
    '1h_5h': { label: string; count: number; pct: number }
    over_5h: { label: string; count: number; pct: number }
  }
}

// ========== Hooks ==========

export function useSdrFollowThrough() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'sdr_follow_through', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_sdr_follow_through', f as never)
      if (error) throw error
      return (data as SdrFollowThroughResponse[] | null)?.[0] ?? null
    },
    staleTime: 60_000,
  })
}

export function useSdrAvgTicket() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'sdr_avg_ticket', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_sdr_avg_ticket', f as never)
      if (error) throw error
      return (data as SdrAvgTicketResponse[] | null)?.[0] ?? null
    },
    staleTime: 60_000,
  })
}

export function useSdrMeetings() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'sdr_meetings', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_sdr_meetings', f as never)
      if (error) throw error
      return (data as SdrMeetingsResponse[] | null)?.[0] ?? null
    },
    staleTime: 60_000,
  })
}

export function useSdrLeadsBySource() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'sdr_leads_by_source', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_sdr_leads_by_source', f as never)
      if (error) throw error
      return (data as SdrLeadsBySourceResponse[] | null)?.[0] ?? null
    },
    staleTime: 60_000,
  })
}

export function useSdrSlaCompliancePct() {
  const f = useFilters()
  return useQuery({
    queryKey: ['av2', 'sdr_sla_compliance_pct', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analytics_sdr_sla_compliance_pct', f as never)
      if (error) throw error
      return (data as SdrSlaComplianceResponse[] | null)?.[0] ?? null
    },
    staleTime: 60_000,
  })
}
