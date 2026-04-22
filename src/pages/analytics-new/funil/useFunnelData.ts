import { useQuery, useQueries } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FunnelStageData, LossReason } from '@/hooks/analytics/useFunnelConversion'
import type { FunnelVelocityRow } from '@/hooks/analytics/useFunnelVelocity'
import type { FunnelMode } from './constants'
import { getPreviousPeriod } from './constants'

export interface FunnelQueryParams {
  dateStart: string
  dateEnd: string
  product: string
  mode: FunnelMode
  ownerIds: string[]
  tagIds: string[]
}

async function fetchFunnelConversion(p: FunnelQueryParams): Promise<FunnelStageData[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('analytics_funnel_conversion', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_product: p.product,
    p_mode: p.mode,
    p_stage_id: null,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as FunnelStageData[]) || []
}

async function fetchLossReasons(p: FunnelQueryParams): Promise<LossReason[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('analytics_loss_reasons', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_product: p.product,
    p_mode: p.mode,
    p_stage_id: null,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as LossReason[]) || []
}

async function fetchVelocity(p: FunnelQueryParams): Promise<FunnelVelocityRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('analytics_funnel_velocity', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as FunnelVelocityRow[]) || []
}

/** Busca conversion + loss + velocity do período atual, e opcionalmente conversion do período anterior pra comparativo. */
export function useFunnelData(params: FunnelQueryParams, compareEnabled: boolean) {
  const current = useQueries({
    queries: [
      {
        queryKey: ['analytics-new', 'funnel-conversion', params],
        queryFn: () => fetchFunnelConversion(params),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-new', 'loss-reasons', params],
        queryFn: () => fetchLossReasons(params),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-new', 'funnel-velocity', params],
        queryFn: () => fetchVelocity(params),
        staleTime: 2 * 60 * 1000,
        retry: 1,
      },
    ],
  })

  const prevRange = compareEnabled ? getPreviousPeriod(params.dateStart, params.dateEnd) : null
  const prevParams: FunnelQueryParams | null = prevRange
    ? { ...params, dateStart: prevRange.start, dateEnd: prevRange.end }
    : null

  const previous = useQuery({
    queryKey: ['analytics-new', 'funnel-conversion', 'prev', prevParams],
    queryFn: () => fetchFunnelConversion(prevParams as FunnelQueryParams),
    enabled: !!prevParams,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const [conversionQ, lossReasonsQ, velocityQ] = current

  return {
    conversion: conversionQ.data ?? [],
    lossReasons: lossReasonsQ.data ?? [],
    velocity: velocityQ.data ?? [],
    previousConversion: previous.data ?? null,
    previousRange: prevRange,
    isLoading:
      conversionQ.isLoading || lossReasonsQ.isLoading || velocityQ.isLoading || previous.isLoading,
    error: conversionQ.error || lossReasonsQ.error || velocityQ.error || previous.error,
    refetch: () => {
      conversionQ.refetch()
      lossReasonsQ.refetch()
      velocityQ.refetch()
      if (prevParams) previous.refetch()
    },
  }
}
