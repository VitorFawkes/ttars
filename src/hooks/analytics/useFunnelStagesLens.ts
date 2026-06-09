import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import type { FunnelStageData } from './useFunnelConversion'

/**
 * Lente do funil para SDR/Planner (Leva D):
 *  - 'now'     = FOTO do agora: cards atualmente em cada etapa (comportamento histórico,
 *                via analytics_funnel_conversion legada → current_count). DEFAULT.
 *  - 'created' = POR SAFRA: a turma de cards CRIADOS no período e até onde chegou
 *                (analytics_funnel_conversion_v3, p_date_ref='created' → period_count).
 *  - 'stage'   = POR ATIVIDADE: transições/entradas em cada etapa DENTRO do período
 *                (v3, p_date_ref='stage' → period_count).
 *
 * 'now' reusa exatamente a RPC legada → zero regressão no padrão; só safra/atividade
 * acionam a v3 (mesmo motor de cohort já provado no Funil principal).
 */
export type FunnelLens = 'now' | 'created' | 'stage'

export interface FunnelLensStage {
  stage_id: string
  stage_nome: string
  phase_slug: string
  ordem: number
  /** contagem da lente ativa (snapshot p/ 'now'; período p/ created/stage) */
  count: number
  /** snapshot do momento, sempre (referência) */
  current_count: number
}

interface FunnelStageV3Min {
  stage_id: string
  stage_nome: string
  phase_slug: string
  ordem: number
  current_count: number
  period_count: number
}

export function useFunnelStagesLens(lens: FunnelLens) {
  const { dateRange, product, ownerIds, tagIds, origins } = useAnalyticsFilters()

  return useQuery({
    queryKey: ['analytics', 'funnel-stages-lens', lens, dateRange.start, dateRange.end, product, ownerIds, tagIds, origins],
    queryFn: async (): Promise<FunnelLensStage[]> => {
      const ownerArg = ownerIds.length > 0 ? ownerIds : undefined
      const tagArg = tagIds.length > 0 ? tagIds : undefined
      const origArg = origins.length > 0 ? origins : undefined

      if (lens === 'now') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
        const { data, error } = await (supabase.rpc as any)('analytics_funnel_conversion', {
          p_date_start: dateRange.start,
          p_date_end: dateRange.end,
          p_product: product,
          p_mode: 'entries',
          p_stage_id: null,
          p_owner_ids: ownerArg,
          p_tag_ids: tagArg,
          p_origens: origArg,
        })
        if (error) throw error
        return ((data as FunnelStageData[]) || []).map(r => ({
          stage_id: r.stage_id,
          stage_nome: r.stage_nome,
          phase_slug: r.phase_slug,
          ordem: r.ordem,
          count: r.current_count,
          current_count: r.current_count,
        }))
      }

      // safra / atividade → motor v3 (period_count honra p_date_ref)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
      const { data, error } = await (supabase.rpc as any)('analytics_funnel_conversion_v3', {
        p_date_start: dateRange.start,
        p_date_end: dateRange.end,
        p_product: product,
        p_date_ref: lens,
        p_status: null,
        p_ganho_fase: null,
        p_stage_id: null,
        p_owner_ids: ownerArg,
        p_tag_ids: tagArg,
        p_origens: origArg,
      })
      if (error) throw error
      return ((data as FunnelStageV3Min[]) || []).map(r => ({
        stage_id: r.stage_id,
        stage_nome: r.stage_nome,
        phase_slug: r.phase_slug,
        ordem: r.ordem,
        count: r.period_count,
        current_count: r.current_count,
      }))
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
