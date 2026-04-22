import { useCallback, useMemo } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAuth } from '@/contexts/AuthContext'
import { useUsers } from '@/hooks/useUsers'

import FunnelFilterPanel from './funil/FunnelFilterPanel'
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
    conversion,
    lossReasons,
    velocity,
    previousConversion,
    previousRange,
    isLoading,
    error,
    refetch,
  } = useFunnelData(funnelParams, state.compareEnabled)

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
