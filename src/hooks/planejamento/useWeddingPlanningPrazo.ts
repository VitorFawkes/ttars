import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useCurrentProductMeta } from '../useCurrentProductMeta'

export const PRAZO_PLANEJAMENTO_FALLBACK = 45
const clampDias = (n: number) => Math.min(365, Math.max(1, Math.round(n)))

/**
 * Prazo-alvo do Planejamento (dias) — DEFAULT por workspace.
 * Lê wedding_planning_settings pelo pipeline WEDDING (fallback 45). O override por
 * casamento vive em cards.produto_data.ww_planej_prazo_dias (resolvido na tela do
 * casamento). O relógio conta da ENTRADA no planejamento (ww_planej_pos_venda_em).
 */
export function useWeddingPlanningPrazo(pipelineIdArg?: string) {
  const meta = useCurrentProductMeta()
  const pipelineId = pipelineIdArg ?? meta.pipelineId ?? null
  const queryClient = useQueryClient()

  const query = useQuery<number>({
    queryKey: ['wedding-planning-settings', pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      if (!pipelineId) return PRAZO_PLANEJAMENTO_FALLBACK
      const { data, error } = await sbAny
        .from('wedding_planning_settings')
        .select('prazo_dias')
        .eq('pipeline_id', pipelineId)
        .maybeSingle()
      if (error) throw error
      const v = (data?.prazo_dias as number | undefined) ?? PRAZO_PLANEJAMENTO_FALLBACK
      return v
    },
  })

  const setDefault = useMutation<void, Error, number>({
    mutationFn: async (dias) => {
      if (!pipelineId) throw new Error('Sem pipeline ativo.')
      const { error } = await sbAny
        .from('wedding_planning_settings')
        .upsert({ pipeline_id: pipelineId, prazo_dias: clampDias(dias) }, { onConflict: 'pipeline_id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wedding-planning-settings'] })
      toast.success('Prazo padrão do workspace atualizado.')
    },
    onError: (err) => toast.error(`Não consegui salvar o prazo padrão: ${err.message}`),
  })

  return {
    defaultDias: query.data ?? PRAZO_PLANEJAMENTO_FALLBACK,
    isLoading: query.isLoading,
    setDefault,
  }
}
