import { useQuery, useQueries } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LossReason } from '@/hooks/analytics/useFunnelConversion'
import type { FunnelVelocityRow } from '@/hooks/analytics/useFunnelVelocity'
import type { DateRef, FunnelStatus, GanhoFase } from './constants'
import { getPreviousPeriod, statusToRpcArray, ganhoFaseToRpc } from './constants'

/**
 * Shape retornado por `analytics_funnel_conversion_v3` (migration 20260422a).
 * Mantenho como tipo local para isolar do hook legado.
 */
export interface FunnelStageV3 {
  stage_id: string
  stage_nome: string
  phase_slug: string
  ordem: number
  current_count: number
  period_count: number
  period_valor: number
  period_receita: number
  p50_days_in_stage: number
  p75_days_in_stage: number
}

export interface FunnelQueryParams {
  dateStart: string
  dateEnd: string
  product: string
  dateRef: DateRef
  status: FunnelStatus
  ganhoFase: GanhoFase
  rootStageId: string | null
  ownerIds: string[]
  tagIds: string[]
}

async function fetchFunnelConversionV3(p: FunnelQueryParams): Promise<FunnelStageV3[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova, types ainda não regenerados
  const { data, error } = await (supabase.rpc as any)('analytics_funnel_conversion_v3', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_product: p.product,
    p_date_ref: p.dateRef,
    p_status: statusToRpcArray(p.status),
    p_ganho_fase: ganhoFaseToRpc(p.ganhoFase),
    p_stage_id: p.rootStageId,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as FunnelStageV3[]) || []
}

async function fetchLossReasons(p: FunnelQueryParams): Promise<LossReason[]> {
  // Loss reasons opera sempre sobre cards com status='perdido'. Usa p_mode='stage_entry'
  // quando o usuário restringe por etapa raiz (para alinhar com o escopo visual do funil);
  // senão 'entries' (padrão) — recorta por data_fechamento/updated_at do perdido.
  const mode = p.rootStageId ? 'stage_entry' : 'entries'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('analytics_loss_reasons', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_product: p.product,
    p_mode: mode,
    p_stage_id: p.rootStageId,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as LossReason[]) || []
}

async function fetchVelocity(p: FunnelQueryParams): Promise<FunnelVelocityRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('analytics_funnel_velocity_v3', {
    p_date_start: p.dateStart,
    p_date_end: p.dateEnd,
    p_product: p.product,
    p_owner_ids: p.ownerIds.length ? p.ownerIds : undefined,
    p_tag_ids: p.tagIds.length ? p.tagIds : undefined,
  })
  if (error) throw error
  return (data as FunnelVelocityRow[]) || []
}

/**
 * Busca conversion + loss + velocity do período atual; opcionalmente a conversion
 * do período anterior pra comparativo. Cada query é independente — a UI pode mostrar
 * loading/erro por bloco sem bloquear os demais.
 */
export function useFunnelData(params: FunnelQueryParams, compareEnabled: boolean) {
  const current = useQueries({
    queries: [
      {
        queryKey: ['analytics-new', 'funnel-v3', 'conversion', params],
        queryFn: () => fetchFunnelConversionV3(params),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-new', 'funnel-v3', 'loss', params],
        queryFn: () => fetchLossReasons(params),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      {
        queryKey: ['analytics-new', 'funnel-v3', 'velocity', params],
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
    queryKey: ['analytics-new', 'funnel-v3', 'conversion-prev', prevParams],
    queryFn: () => fetchFunnelConversionV3(prevParams as FunnelQueryParams),
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

    // Loading e erro por bloco (para UI não ficar monolítica)
    conversionLoading: conversionQ.isLoading,
    lossLoading: lossReasonsQ.isLoading,
    velocityLoading: velocityQ.isLoading,
    previousLoading: previous.isLoading,

    conversionError: conversionQ.error,
    lossError: lossReasonsQ.error,
    velocityError: velocityQ.error,
    previousError: previous.error,

    // Atalhos agregados (quando a UI realmente precisa do consolidado)
    anyError: conversionQ.error || lossReasonsQ.error || velocityQ.error || previous.error,

    refetch: () => {
      conversionQ.refetch()
      lossReasonsQ.refetch()
      velocityQ.refetch()
      if (prevParams) previous.refetch()
    },
  }
}
