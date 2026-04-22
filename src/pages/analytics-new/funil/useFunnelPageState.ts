import { useState } from 'react'
import type { DateRef, FunnelMetric, FunnelStatus, GanhoFase } from './constants'

/**
 * State local dos filtros da página /analytics/funil (não compartilhado entre páginas).
 * Filtros de Período, Produto, Owner e Tags vêm do Zustand global `useAnalyticsFilters`.
 */
export function useFunnelPageState() {
  const [dateRef, setDateRef] = useState<DateRef>('stage')
  const [status, setStatus] = useState<FunnelStatus>('all')
  const [ganhoFase, setGanhoFase] = useState<GanhoFase>('any')
  const [metric, setMetric] = useState<FunnelMetric>('cards')
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [rootStageId, setRootStageId] = useState<string | null>(null)

  return {
    dateRef,
    setDateRef,
    status,
    setStatus,
    ganhoFase,
    setGanhoFase,
    metric,
    setMetric,
    compareEnabled,
    setCompareEnabled,
    rootStageId,
    setRootStageId,
  }
}

export type FunnelPageState = ReturnType<typeof useFunnelPageState>
