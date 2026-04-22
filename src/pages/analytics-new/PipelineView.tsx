import { useCallback, useMemo } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { usePipelineCurrent } from '@/hooks/analytics/usePipelineCurrent'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useAuth } from '@/contexts/AuthContext'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { getPhaseLabel } from '@/lib/pipeline/phaseLabels'

import PipelineKpis from './pipeline/PipelineKpis'
import PipelineFilterPanel from './pipeline/PipelineFilterPanel'
import PipelineStagesChart from './pipeline/PipelineStagesChart'
import PipelineAgingHeatmap from './pipeline/PipelineAgingHeatmap'
import PipelineOwnerWorkload from './pipeline/PipelineOwnerWorkload'
import PipelineOwnersTable from './pipeline/PipelineOwnersTable'
import PipelineTasksSection from './pipeline/PipelineTasksSection'
import PipelineTopDeals from './pipeline/PipelineTopDeals'
import { usePipelinePageState } from './pipeline/usePipelinePageState'
import { PHASE_COLORS, matchesPhase, slugToSystemPhase, type PhaseFilter } from './pipeline/constants'

const EMPTY_KPI = {
  total_open: 0,
  total_value: 0,
  total_receita: 0,
  avg_ticket: 0,
  avg_receita_ticket: 0,
  avg_age_days: 0,
  sla_breach_count: 0,
  sla_breach_pct: 0,
}

export default function PipelineView() {
  const drillDown = useDrillDownStore()
  const { profile } = useAuth()
  const { ownerIds, setOwnerIds } = useAnalyticsFilters()
  const { pipelineId } = useCurrentProductMeta()
  const { data: phases = [] } = usePipelinePhases(pipelineId ?? undefined)

  const state = usePipelinePageState()

  const phaseLabel = useCallback(
    (slug: string | null | undefined) => {
      const normalized = slugToSystemPhase(slug)
      return getPhaseLabel(phases, normalized ?? slug ?? '')
    },
    [phases]
  )

  // ── Fetch ──
  const { data, isLoading, error, refetch } = usePipelineCurrent({
    dateRef: state.dateRef,
    valueMin: state.debouncedMin,
    valueMax: state.debouncedMax,
  })

  // ── Decomposição ──
  const allStages = useMemo(() => data?.stages ?? [], [data?.stages])
  const allAging = useMemo(() => data?.aging ?? [], [data?.aging])
  const allOwners = useMemo(() => data?.owners ?? [], [data?.owners])
  const allDeals = useMemo(() => data?.top_deals ?? [], [data?.top_deals])
  const taskMetrics = useMemo(() => data?.tasks ?? null, [data?.tasks])
  const globalKpis = useMemo(() => data?.kpis ?? EMPTY_KPI, [data?.kpis])

  // ── Meu Pipeline ──
  const profileId = profile?.id ?? null
  const isMyPipeline = !!(profileId && ownerIds.length === 1 && ownerIds[0] === profileId)
  const toggleMyPipeline = useCallback(() => {
    if (!profileId) return
    if (isMyPipeline) setOwnerIds([])
    else setOwnerIds([profileId])
  }, [profileId, isMyPipeline, setOwnerIds])

  // ── Phase summaries (sempre globais) ──
  const phaseSummaries = useMemo(() => {
    const slugs: PhaseFilter[] = ['sdr', 'planner', 'pos-venda']
    return slugs.map(slug => {
      const filtered = allStages.filter(s => matchesPhase(s.fase_slug, slug))
      const count = filtered.reduce((sum, s) => sum + s.card_count, 0)
      const value = filtered.reduce((sum, s) => sum + s.valor_total, 0)
      const receita = filtered.reduce((sum, s) => sum + (s.receita_total || 0), 0)
      const avgDays =
        count > 0
          ? +(filtered.reduce((sum, s) => sum + s.avg_days * s.card_count, 0) / count).toFixed(1)
          : 0
      return {
        slug,
        label: phaseLabel(slug),
        color: PHASE_COLORS[slug],
        count,
        value,
        receita,
        avgDays,
      }
    })
  }, [allStages, phaseLabel])

  const unassignedCount = useMemo(
    () => allOwners.find(o => o.owner_id === null)?.total_cards ?? 0,
    [allOwners]
  )

  const selectedOwnerLabel = useMemo(() => {
    if (ownerIds.length === 0 || isMyPipeline) return null
    if (ownerIds.length === 1) {
      const found = allOwners.find(o => o.owner_id === ownerIds[0])
      return found?.owner_nome ?? null
    }
    return `${ownerIds.length} consultores`
  }, [ownerIds, isMyPipeline, allOwners])

  // ── Filtrado por fase ──
  const stages = useMemo(
    () => allStages.filter(s => matchesPhase(s.fase_slug, state.phaseFilter)),
    [allStages, state.phaseFilter]
  )
  const aging = useMemo(
    () => allAging.filter(a => matchesPhase(a.fase_slug, state.phaseFilter)),
    [allAging, state.phaseFilter]
  )

  // ── KPIs derivados ──
  const kpis = useMemo(() => {
    if (state.phaseFilter === 'all') return globalKpis
    const count = stages.reduce((sum, s) => sum + s.card_count, 0)
    const value = stages.reduce((sum, s) => sum + s.valor_total, 0)
    const receita = stages.reduce((sum, s) => sum + (s.receita_total || 0), 0)
    const slaBreach = stages.reduce((sum, s) => sum + s.sla_breach_count, 0)
    return {
      total_open: count,
      total_value: value,
      total_receita: receita,
      avg_ticket: count > 0 ? Math.round(value / count) : 0,
      avg_receita_ticket: count > 0 ? Math.round(receita / count) : 0,
      avg_age_days:
        count > 0
          ? +(stages.reduce((sum, s) => sum + s.avg_days * s.card_count, 0) / count).toFixed(1)
          : 0,
      sla_breach_count: slaBreach,
      sla_breach_pct: 0,
    }
  }, [state.phaseFilter, stages, globalKpis])

  // ── Stage display names (com disambiguation W/T) ──
  const stageDisplayNames = useMemo(() => {
    const nameCount = new Map<string, number>()
    for (const s of stages) nameCount.set(s.stage_nome, (nameCount.get(s.stage_nome) || 0) + 1)
    const map = new Map<string, string>()
    for (const s of stages) {
      const isDupe = (nameCount.get(s.stage_nome) || 0) > 1
      const suffix =
        isDupe && s.produto === 'WEDDING'
          ? ' (W)'
          : isDupe && s.produto
            ? ` (${s.produto[0]})`
            : ''
      map.set(s.stage_id, s.stage_nome + suffix)
    }
    return map
  }, [stages])

  // ── Drill-down handlers ──
  const handleStageDrill = useCallback(
    (stageId: string, stageName: string) => {
      drillDown.open({
        label: stageName,
        drillStageId: stageId,
        drillSource: 'current_stage',
        excludeTerminal: true,
      })
    },
    [drillDown]
  )
  const handleAllCardsDrill = useCallback(() => {
    drillDown.open({
      label: 'Pipeline Aberto',
      drillSource: 'current_stage',
      excludeTerminal: true,
    })
  }, [drillDown])

  const handleOwnerFilter = useCallback(
    (ownerId: string | null) => {
      if (!ownerId) return
      if (ownerIds.length === 1 && ownerIds[0] === ownerId) setOwnerIds([])
      else setOwnerIds([ownerId])
    },
    [ownerIds, setOwnerIds]
  )

  const handleOwnerToggle = useCallback(
    (ownerId: string) => {
      setOwnerIds(ownerIds.includes(ownerId) ? ownerIds.filter(id => id !== ownerId) : [ownerId])
    },
    [ownerIds, setOwnerIds]
  )

  const valueRangeActive = !!(state.debouncedMin || state.debouncedMax)

  return (
    <div className="space-y-5">
      {error && (
        <QueryErrorState
          compact
          title="Erro ao carregar snapshot do pipeline"
          onRetry={refetch}
        />
      )}

      <PipelineKpis
        kpis={kpis}
        metric={state.metric}
        dateRef={state.dateRef}
        unassignedCount={unassignedCount}
        isLoading={isLoading}
        onAllCardsDrill={handleAllCardsDrill}
      />

      <PipelineFilterPanel
        dateRef={state.dateRef}
        setDateRef={state.setDateRef}
        metric={state.metric}
        setMetric={state.setMetric}
        valueMinInput={state.valueMinInput}
        setValueMinInput={state.setValueMinInput}
        valueMaxInput={state.valueMaxInput}
        setValueMaxInput={state.setValueMaxInput}
        profileId={profileId}
        isMyPipeline={isMyPipeline}
        onToggleMyPipeline={toggleMyPipeline}
        selectedOwnerLabel={selectedOwnerLabel}
        onClearOwner={() => setOwnerIds([])}
        phaseSummaries={phaseSummaries}
        phaseFilter={state.phaseFilter}
        setPhaseFilter={state.setPhaseFilter}
        phaseLabel={phaseLabel}
      />

      <PipelineStagesChart
        isLoading={isLoading}
        stages={stages}
        owners={allOwners}
        stageDisplayNames={stageDisplayNames}
        metric={state.metric}
        phaseFilter={state.phaseFilter}
        chartGroupBy={state.chartGroupBy}
        setChartGroupBy={state.setChartGroupBy}
        phaseLabel={phaseLabel}
        onStageDrill={handleStageDrill}
        onOwnerFilter={handleOwnerFilter}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PipelineAgingHeatmap
          isLoading={isLoading}
          aging={aging}
          stageDisplayNames={stageDisplayNames}
          dateRef={state.dateRef}
          onStageDrill={handleStageDrill}
        />
        <PipelineOwnerWorkload
          isLoading={isLoading}
          owners={allOwners}
          metric={state.metric}
          phaseFilter={state.phaseFilter}
          phaseLabel={phaseLabel}
          onOwnerFilter={handleOwnerFilter}
        />
      </div>

      <PipelineOwnersTable
        isLoading={isLoading}
        owners={allOwners}
        phaseFilter={state.phaseFilter}
        phaseLabel={phaseLabel}
        dateRef={state.dateRef}
        ownerIds={ownerIds}
        onOwnerFilter={handleOwnerFilter}
        ownerSort={state.ownerSort}
        toggleOwnerSort={state.toggleOwnerSort}
      />

      <PipelineTasksSection
        isLoading={isLoading}
        taskMetrics={taskMetrics}
        kpis={kpis}
        ownerIds={ownerIds}
        onOwnerToggle={handleOwnerToggle}
      />

      <PipelineTopDeals
        isLoading={isLoading}
        deals={allDeals}
        phaseFilter={state.phaseFilter}
        phaseLabel={phaseLabel}
        dateRef={state.dateRef}
        ownerIds={ownerIds}
        onOwnerFilter={handleOwnerFilter}
        dealSort={state.dealSort}
        toggleDealSort={state.toggleDealSort}
        valueRangeActive={valueRangeActive}
      />
    </div>
  )
}
