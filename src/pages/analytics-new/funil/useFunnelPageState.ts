import { useCallback, useEffect, useState } from 'react'
import type { DateRef, FunnelMetric, FunnelStatus, GanhoFase } from './constants'
import type { KpiConfig } from './kpiConfig'

const KPI_STORAGE_KEY_PREFIX = 'welcomecrm.funil.kpis.v1'

function loadKpis(orgId: string | undefined, product: string | undefined): KpiConfig[] | null {
  if (!orgId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${KPI_STORAGE_KEY_PREFIX}.${orgId}.${product ?? 'default'}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as KpiConfig[]
    if (!Array.isArray(parsed) || parsed.length !== 4) return null
    return parsed
  } catch {
    return null
  }
}

function saveKpis(orgId: string | undefined, product: string | undefined, configs: KpiConfig[]): void {
  if (!orgId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${KPI_STORAGE_KEY_PREFIX}.${orgId}.${product ?? 'default'}`,
      JSON.stringify(configs)
    )
  } catch {
    // silencioso — storage cheio ou desabilitado não deve quebrar a página
  }
}

/**
 * State local dos filtros da página /analytics/funil.
 * kpiConfigs persistem em localStorage por (orgId, product).
 */
export function useFunnelPageState(orgId?: string, product?: string) {
  const [dateRef, setDateRef] = useState<DateRef>('stage')
  const [status, setStatus] = useState<FunnelStatus>('all')
  const [ganhoFase, setGanhoFase] = useState<GanhoFase>('any')
  const [metric, setMetric] = useState<FunnelMetric>('cards')
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [rootStageId, setRootStageId] = useState<string | null>(null)

  /** null = ainda não inicializado pelo FunnelView (aguarda stages pra montar defaults). */
  const [kpiConfigs, setKpiConfigsState] = useState<KpiConfig[] | null>(() =>
    loadKpis(orgId, product)
  )

  // Reidrata quando troca de workspace ou produto
  useEffect(() => {
    setKpiConfigsState(loadKpis(orgId, product))
  }, [orgId, product])

  const setKpiConfigs = useCallback(
    (configs: KpiConfig[]) => {
      setKpiConfigsState(configs)
      saveKpis(orgId, product, configs)
    },
    [orgId, product]
  )

  const resetKpiConfigs = useCallback(() => {
    setKpiConfigsState(null)
    if (orgId && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(
          `${KPI_STORAGE_KEY_PREFIX}.${orgId}.${product ?? 'default'}`
        )
      } catch {
        /* ignore */
      }
    }
  }, [orgId, product])

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
    kpiConfigs,
    setKpiConfigs,
    resetKpiConfigs,
  }
}

export type FunnelPageState = ReturnType<typeof useFunnelPageState>
