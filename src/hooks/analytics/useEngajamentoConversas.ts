import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  EngajamentoFilters,
  EngajamentoResponse,
  ThreadResponse,
} from '@/types/engagement'

interface UseEngajamentoConversasOptions {
  filters: EngajamentoFilters
  page?: number
  limit?: number
  enabled?: boolean
}

const EMPTY_RESPONSE: EngajamentoResponse = {
  kpis: {
    total_contacts: 0,
    reply_rate: null,
    depth_avg: null,
    cold_pct: null,
    responded_once_left_pct: null,
    frt_median_hours: null,
    active_count: 0,
    win_rate: null,
  },
  funnel: [],
  by_line: [],
  state_distribution: [],
  depth_histogram: [],
  conversations: [],
  pagination: { page: 1, limit: 50, total: 0 },
  lines: [],
}

export function useEngajamentoConversas({
  filters,
  page = 1,
  limit = 50,
  enabled = true,
}: UseEngajamentoConversasOptions) {
  return useQuery<EngajamentoResponse>({
    queryKey: [
      'analytics',
      'weddings-engajamento',
      filters.dateFrom,
      filters.dateTo,
      filters.lineLabels,
      filters.attributionModes,
      filters.stateFilter,
      filters.includeTestLines,
      filters.coldThresholdHours,
      page,
      limit,
    ],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
      const { data, error } = await (supabase.rpc as any)('analytics_weddings_conversations', {
        p_from: filters.dateFrom,
        p_to: filters.dateTo,
        p_line_labels: filters.lineLabels.length > 0 ? filters.lineLabels : null,
        p_attribution_modes:
          filters.attributionModes.length > 0 ? filters.attributionModes : null,
        p_state_filter: filters.stateFilter.length > 0 ? filters.stateFilter : null,
        p_cold_threshold_hours: filters.coldThresholdHours,
        p_include_test_lines: filters.includeTestLines,
        p_page: page,
        p_limit: limit,
      })

      if (error) throw error
      return (data as EngajamentoResponse | null) ?? EMPTY_RESPONSE
    },
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  })
}

export function useEngajamentoThread(
  customerPhone: string | null,
  phoneLineLabel: string | null
) {
  return useQuery<ThreadResponse>({
    queryKey: ['engajamento-thread', customerPhone, phoneLineLabel],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
      const { data, error } = await (supabase.rpc as any)('get_weddings_conversation_thread', {
        p_customer_phone: customerPhone,
        p_phone_line_label: phoneLineLabel,
        p_limit: 200,
      })

      if (error) throw error
      return (
        (data as ThreadResponse | null) ?? {
          thread: [],
          stats: { total: 0, inbound: 0, outbound: 0, sources_used: [] },
        }
      )
    },
    enabled: !!customerPhone && !!phoneLineLabel,
    staleTime: 30 * 1000,
  })
}
