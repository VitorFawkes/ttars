import { useState } from 'react'
import type { FunnelMetric, FunnelMode } from './constants'

/** State local dos filtros da página /analytics/funil (não compartilhado com outras páginas). */
export function useFunnelPageState() {
  const [mode, setMode] = useState<FunnelMode>('entries')
  const [metric, setMetric] = useState<FunnelMetric>('cards')
  const [compareEnabled, setCompareEnabled] = useState(false)
  // null = primeira etapa do pipeline; caso contrário vira o "topo" do funil
  const [rootStageId, setRootStageId] = useState<string | null>(null)

  return {
    mode,
    setMode,
    metric,
    setMetric,
    compareEnabled,
    setCompareEnabled,
    rootStageId,
    setRootStageId,
  }
}

export type FunnelPageState = ReturnType<typeof useFunnelPageState>
