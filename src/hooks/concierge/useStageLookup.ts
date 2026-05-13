import { useMemo } from 'react'
import { usePipelineStages } from '../usePipelineStages'
import { useCurrentProductMeta } from '../useCurrentProductMeta'

/**
 * Lookup `pipeline_stage_id → nome` da fase, filtrado pelo pipeline do
 * produto atual (workspace). Usado pra mostrar a fase do card-pai em
 * pills do kanban Concierge.
 *
 * Usa cache do React Query (`usePipelineStages`) — chamadas de múltiplos
 * cards no mesmo render reusam o resultado.
 */
export function useStageLookup(): Map<string, string> {
  const { pipelineId } = useCurrentProductMeta()
  const { data: stages } = usePipelineStages(pipelineId, true)

  return useMemo(() => {
    const map = new Map<string, string>()
    if (!stages) return map
    for (const stage of stages) {
      const nome = (stage as { nome?: string; name?: string }).nome
        ?? (stage as { nome?: string; name?: string }).name
        ?? 'Etapa'
      map.set(stage.id, nome)
    }
    return map
  }, [stages])
}
