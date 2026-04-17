import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type OutboundQueueStatus =
  | 'pending' | 'scheduled' | 'processing' | 'sent' | 'failed' | 'skipped' | 'expired'

export interface OutboundQueueItem {
  id: string
  org_id: string
  agent_id: string
  card_id: string
  contato_id: string
  contact_phone: string
  contact_name: string | null
  form_data: Record<string, unknown>
  trigger_type: string
  trigger_metadata: Record<string, unknown>
  status: OutboundQueueStatus
  scheduled_for: string | null
  processed_at: string | null
  error_message: string | null
  attempts: number
  max_attempts: number
  next_retry_at: string | null
  created_at: string
  updated_at: string
  // Joins
  ai_agents?: { nome: string } | null
}

export interface OutboundQueueStats {
  total_pending: number
  total_sent_today: number
  total_failed_today: number
  total_skipped: number
  success_rate_7d: number
}

interface UseOutboundQueueFilters {
  agentId?: string
  status?: OutboundQueueStatus | 'all'
  triggerType?: string | 'all'
  dateFrom?: string
  dateTo?: string
}

const QUERY_KEY = ['outbound-queue']

export function useOutboundQueue(filters: UseOutboundQueueFilters = {}) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, 'items', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('ai_outbound_queue')
        .select('*, ai_agents(nome)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.agentId && filters.agentId !== 'all') {
        q = q.eq('agent_id', filters.agentId)
      }
      if (filters.status && filters.status !== 'all') {
        q = q.eq('status', filters.status)
      }
      if (filters.triggerType && filters.triggerType !== 'all') {
        q = q.eq('trigger_type', filters.triggerType)
      }
      if (filters.dateFrom) {
        q = q.gte('created_at', filters.dateFrom)
      }
      if (filters.dateTo) {
        q = q.lte('created_at', filters.dateTo)
      }

      const { data, error } = await q
      if (error) throw error
      return (data || []) as OutboundQueueItem[]
    },
    refetchInterval: 30_000,
  })

  const stats = useQuery({
    queryKey: [...QUERY_KEY, 'stats', filters.agentId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_outbound_queue_stats', {
        p_agent_id: filters.agentId && filters.agentId !== 'all' ? filters.agentId : null,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row || {
        total_pending: 0,
        total_sent_today: 0,
        total_failed_today: 0,
        total_skipped: 0,
        success_rate_7d: 0,
      }) as OutboundQueueStats
    },
    refetchInterval: 30_000,
  })

  const reprocess = useMutation({
    mutationFn: async (itemId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_outbound_queue')
        .update({ status: 'pending', attempts: 0, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const cancel = useMutation({
    mutationFn: async (itemId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_outbound_queue')
        .update({ status: 'skipped', error_message: 'Cancelado manualmente', updated_at: new Date().toISOString() })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    stats: stats.data,
    isLoadingStats: stats.isLoading,
    reprocess,
    cancel,
  }
}
