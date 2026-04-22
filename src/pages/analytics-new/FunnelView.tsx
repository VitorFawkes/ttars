import { useCallback, useMemo } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAuth } from '@/contexts/AuthContext'
import { useUsers } from '@/hooks/useUsers'
import { useMyVisiblePhases } from '@/hooks/useMyVisiblePhases'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
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
    conversion: rpcConversion,
    lossReasons,
    velocity: rpcVelocity,
    previousConversion: rpcPreviousConversion,
    previousRange,
    isLoading,
    error,
    refetch,
  } = useFunnelData(funnelParams, state.compareEnabled)

  // Filtra etapas pelas fases visíveis ao usuário (respeitando phase_visibility_rules
  // e a fase do time dele). Admins e users sem time veem tudo (visiblePhaseIds == null).
  const { data: visiblePhaseIds = null } = useMyVisiblePhases()
  const { pipelineId } = useCurrentProductMeta()
  const { data: pipelinePhases = [] } = usePipelinePhases(pipelineId ?? undefined)

  const visibleSlugs = useMemo<Set<string> | null>(() => {
    if (!visiblePhaseIds) return null // null = admin ou sem time → vê tudo
    const visibleIds = new Set(visiblePhaseIds)
    const slugs = new Set<string>()
    for (const p of pipelinePhases) {
      if (visibleIds.has(p.id) && p.slug) slugs.add(p.slug)
    }
    return slugs
  }, [visiblePhaseIds, pipelinePhases])

  // Aplica o filtro de visibilidade antes de tudo
  const rawConversion = useMemo(
    () =>
      visibleSlugs == null
        ? rpcConversion
        : rpcConversion.filter(s => visibleSlugs.has(s.phase_slug)),
    [rpcConversion, visibleSlugs]
  )
  const rawVelocity = useMemo(
    () =>
      visibleSlugs == null
        ? rpcVelocity
        : rpcVelocity.filter(s => s.phase_slug != null && visibleSlugs.has(s.phase_slug)),
    [rpcVelocity, visibleSlugs]
  )
  const rawPreviousConversion = useMemo(() => {
    if (!rpcPreviousConversion) return null
    if (visibleSlugs == null) return rpcPreviousConversion
    return rpcPreviousConversion.filter(s => visibleSlugs.has(s.phase_slug))
  }, [rpcPreviousConversion, visibleSlugs])

  // Dropdown "Desde" usa as etapas da RPC (mesma fonte do funil, mesma ordem).
  // A RPC já devolve ordenado por `pp.order_index, s.ordem`.
  const stageOptions: StageOption[] = useMemo(
    () =>
      rawConversion.map((s, idx) => ({
        id: s.stage_id,
        nome: s.stage_nome,
        ordem: idx,
      })),
    [rawConversion]
  )

  // A RPC `analytics_funnel_conversion` já devolve as etapas ordenadas por
  // `pp.order_index, s.ordem` (mesma ordem do Kanban/Pipeline Studio).
  // NÃO reordenamos no front — só recortamos a partir da etapa raiz.
  const rootIndex = useMemo(() => {
    if (!state.rootStageId) return 0
    const idx = rawConversion.findIndex(s => s.stage_id === state.rootStageId)
    return idx >= 0 ? idx : 0
  }, [state.rootStageId, rawConversion])

  const conversion = useMemo(
    () => (rootIndex === 0 ? rawConversion : rawConversion.slice(rootIndex)),
    [rawConversion, rootIndex]
  )

  // IDs das etapas visíveis no funil (após recorte) — usadas pra filtrar velocity
  // e previousConversion preservando a ordem canônica da RPC.
  const visibleStageIds = useMemo(
    () => new Set(conversion.map(s => s.stage_id)),
    [conversion]
  )

  const previousConversion = useMemo(() => {
    if (!rawPreviousConversion) return null
    if (state.rootStageId == null) return rawPreviousConversion
    return rawPreviousConversion.filter(s => visibleStageIds.has(s.stage_id))
  }, [rawPreviousConversion, visibleStageIds, state.rootStageId])

  const velocity = useMemo(() => {
    if (state.rootStageId == null) return rawVelocity
    return rawVelocity.filter(s => visibleStageIds.has(s.stage_id))
  }, [rawVelocity, visibleStageIds, state.rootStageId])

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
