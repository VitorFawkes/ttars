import { useState, useEffect } from 'react'
import type { DateRef } from '@/hooks/analytics/usePipelineCurrent'
import type {
  PhaseFilter,
  MetricMode,
  DealSortField,
  OwnerSortField,
  ChartGroupBy,
} from './constants'

/**
 * State local da página /analytics/pipeline.
 * Filtros NÃO compartilhados com outras páginas (por design — "filtros por página").
 *
 * Filtros globais que vivem em useAnalyticsFilters (zustand):
 *   - product (sync do useProductContext)
 *   - ownerIds (compartilhado pra manter "Meu Pipeline" e cross-page)
 *   - tagIds
 */
export function usePipelinePageState() {
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all')
  const [metric, setMetric] = useState<MetricMode>('cards')
  const [dateRef, setDateRef] = useState<DateRef>('stage')
  const [chartGroupBy, setChartGroupBy] = useState<ChartGroupBy>('stage')

  const [valueMinInput, setValueMinInput] = useState('')
  const [valueMaxInput, setValueMaxInput] = useState('')
  const [debouncedMin, setDebouncedMin] = useState<number | null>(null)
  const [debouncedMax, setDebouncedMax] = useState<number | null>(null)

  const [dealSort, setDealSort] = useState<{ field: DealSortField; dir: 'asc' | 'desc' }>({
    field: 'days_in_stage',
    dir: 'desc',
  })
  const [ownerSort, setOwnerSort] = useState<{ field: OwnerSortField; dir: 'asc' | 'desc' }>({
    field: 'total_cards',
    dir: 'desc',
  })

  useEffect(() => {
    const t = setTimeout(() => {
      if (valueMinInput === '') {
        setDebouncedMin(null)
        return
      }
      const v = parseFloat(valueMinInput)
      setDebouncedMin(!isNaN(v) ? v : null)
    }, 500)
    return () => clearTimeout(t)
  }, [valueMinInput])

  useEffect(() => {
    const t = setTimeout(() => {
      if (valueMaxInput === '') {
        setDebouncedMax(null)
        return
      }
      const v = parseFloat(valueMaxInput)
      setDebouncedMax(!isNaN(v) ? v : null)
    }, 500)
    return () => clearTimeout(t)
  }, [valueMaxInput])

  const toggleDealSort = (field: DealSortField) => {
    setDealSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: 'desc' }
    )
  }

  const toggleOwnerSort = (field: OwnerSortField) => {
    setOwnerSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: 'desc' }
    )
  }

  return {
    phaseFilter,
    setPhaseFilter,
    metric,
    setMetric,
    dateRef,
    setDateRef,
    chartGroupBy,
    setChartGroupBy,
    valueMinInput,
    setValueMinInput,
    valueMaxInput,
    setValueMaxInput,
    debouncedMin,
    debouncedMax,
    dealSort,
    toggleDealSort,
    ownerSort,
    toggleOwnerSort,
  }
}

export type PipelinePageState = ReturnType<typeof usePipelinePageState>
