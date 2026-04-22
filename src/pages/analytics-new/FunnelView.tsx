import { useCallback, useMemo } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAuth } from '@/contexts/AuthContext'
import { useUsers } from '@/hooks/useUsers'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'

import FunnelFilterPanel, { type StageOption } from './funil/FunnelFilterPanel'
import FunnelKpis from './funil/FunnelKpis'
import FunnelVisual from './funil/FunnelVisual'
import FunnelVelocityTable from './funil/FunnelVelocityTable'
import FunnelLossReasons from './funil/FunnelLossReasons'
import { useFunnelData } from './funil/useFunnelData'
import { useFunnelPageState } from './funil/useFunnelPageState'

export default function FunnelView() {
  const { profile } = useAuth()
  const drillDown = useDrillDownStore()
  const { dateRange, datePreset, setDatePreset, product, ownerIds, setOwnerIds, tagIds } =
    useAnalyticsFilters()

  const state = useFunnelPageState()

  // Lista de etapas do pipeline ativo — alimenta o seletor "Desde" e filtra o funil
  const { pipelineId } = useCurrentProductMeta()
  const { data: pipelineStages = [] } = usePipelineStages(pipelineId ?? undefined)

  const stageOptions: StageOption[] = useMemo(
    () =>
      [...pipelineStages]
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map(s => ({
          id: s.id,
          nome: s.nome,
          ordem: s.ordem ?? 0,
        })),
    [pipelineStages]
  )

  // Índice da etapa raiz dentro do array do Pipeline Studio (ordem canônica).
  // null = do começo.
  const rootStageIndex = useMemo(() => {
    if (!state.rootStageId) return null
    const idx = stageOptions.findIndex(s => s.id === state.rootStageId)
    return idx >= 0 ? idx : null
  }, [state.rootStageId, stageOptions])

  // Mapa stage_id → índice na ordem canônica do Pipeline Studio.
  const stageOrderMap = useMemo(() => {
    const m = new Map<string, number>()
    stageOptions.forEach((s, idx) => m.set(s.id, idx))
    return m
  }, [stageOptions])

  const profileId = profile?.id ?? null
  const isMyFunnel = !!(profileId && ownerIds.length === 1 && ownerIds[0] === profileId)
  const toggleMyFunnel = useCallback(() => {
    if (!profileId) return
    setOwnerIds(isMyFunnel ? [] : [profileId])
  }, [profileId, isMyFunnel, setOwnerIds])

  // Label do owner selecionado (lista de profiles da org)
  const { users } = useUsers()
  const selectedOwnerLabel = useMemo(() => {
    if (ownerIds.length === 0 || isMyFunnel) return null
    if (ownerIds.length === 1) {
      const found = users.find(u => u.id === ownerIds[0])
      return found?.nome ?? null
    }
    return `${ownerIds.length} consultores`
  }, [ownerIds, isMyFunnel, users])

  const funnelParams = useMemo(
    () => ({
      dateStart: dateRange.start,
      dateEnd: dateRange.end,
      product,
      mode: state.mode,
      ownerIds,
      tagIds,
    }),
    [dateRange.start, dateRange.end, product, state.mode, ownerIds, tagIds]
  )

  const {
    conversion: rawConversion,
    lossReasons,
    velocity: rawVelocity,
    previousConversion: rawPreviousConversion,
    previousRange,
    isLoading,
    error,
    refetch,
  } = useFunnelData(funnelParams, state.compareEnabled)

  // Ordena rows pela ordem canônica do Pipeline Studio (etapas não mapeadas vão no fim)
  // e recorta a partir da etapa raiz selecionada.
  const sortByCanonicalOrder = useCallback(
    <T extends { stage_id: string }>(rows: T[]): T[] => {
      const ordered = [...rows].sort((a, b) => {
        const ia = stageOrderMap.get(a.stage_id) ?? Number.MAX_SAFE_INTEGER
        const ib = stageOrderMap.get(b.stage_id) ?? Number.MAX_SAFE_INTEGER
        return ia - ib
      })
      if (rootStageIndex == null) return ordered
      return ordered.filter(r => {
        const idx = stageOrderMap.get(r.stage_id)
        return idx != null && idx >= rootStageIndex
      })
    },
    [stageOrderMap, rootStageIndex]
  )

  const conversion = useMemo(() => sortByCanonicalOrder(rawConversion), [rawConversion, sortByCanonicalOrder])
  const previousConversion = useMemo(
    () => (rawPreviousConversion ? sortByCanonicalOrder(rawPreviousConversion) : null),
    [rawPreviousConversion, sortByCanonicalOrder]
  )
  const velocity = useMemo(() => sortByCanonicalOrder(rawVelocity), [rawVelocity, sortByCanonicalOrder])

  const handleStageDrill = useCallback(
    (stageId: string, stageName: string) => {
      drillDown.open({
        label: stageName,
        drillStageId: stageId,
        drillSource: 'stage_entries',
      })
    },
    [drillDown]
  )

  const handleReasonDrill = useCallback(
    (reason: string) => {
      drillDown.open({
        label: `Perdidos: ${reason || 'Sem motivo'}`,
        drillLossReason: reason,
        drillStatus: 'perdido',
        drillSource: 'lost_deals',
      })
    },
    [drillDown]
  )

  return (
    <div className="space-y-5">
      {error && (
        <QueryErrorState
          compact
          title="Erro ao carregar funil"
          onRetry={refetch}
        />
      )}

      <FunnelFilterPanel
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        mode={state.mode}
        setMode={state.setMode}
        metric={state.metric}
        setMetric={state.setMetric}
        compareEnabled={state.compareEnabled}
        setCompareEnabled={state.setCompareEnabled}
        previousRange={previousRange}
        profileId={profileId}
        isMyFunnel={isMyFunnel}
        onToggleMyFunnel={toggleMyFunnel}
        selectedOwnerLabel={selectedOwnerLabel}
        onClearOwner={() => setOwnerIds([])}
        stageOptions={stageOptions}
        rootStageId={state.rootStageId}
        setRootStageId={state.setRootStageId}
      />

      <FunnelKpis
        isLoading={isLoading}
        stages={conversion}
        previousStages={previousConversion}
        metric={state.metric}
        compareEnabled={state.compareEnabled}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FunnelVisual
            isLoading={isLoading}
            stages={conversion}
            previousStages={previousConversion}
            metric={state.metric}
            compareEnabled={state.compareEnabled}
            onStageDrill={handleStageDrill}
          />
        </div>
        <div>
          <FunnelLossReasons
            isLoading={isLoading}
            reasons={lossReasons}
            onReasonDrill={handleReasonDrill}
          />
        </div>
      </div>

      <FunnelVelocityTable isLoading={isLoading} rows={velocity} />
    </div>
  )
}
