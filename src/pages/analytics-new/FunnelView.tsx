import { useCallback, useMemo } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAuth } from '@/contexts/AuthContext'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import {
  useFilterProfiles,
  useFilterTags,
  useFilterTeams,
} from '@/hooks/analytics/useFilterOptions'

import FunnelFilterPanel, { type StageOption } from './funil/FunnelFilterPanel'
import FunnelKpis from './funil/FunnelKpis'
import FunnelVisual from './funil/FunnelVisual'
import FunnelVelocityTable from './funil/FunnelVelocityTable'
import FunnelLossReasons from './funil/FunnelLossReasons'
import { useFunnelData } from './funil/useFunnelData'
import { useFunnelPageState } from './funil/useFunnelPageState'
import type { PickerOption, PickerSection } from './funil/MultiPickerPopover'

export default function FunnelView() {
  const { profile } = useAuth()
  const drillDown = useDrillDownStore()
  const {
    dateRange,
    datePreset,
    setDatePreset,
    product,
    ownerIds,
    setOwnerIds,
    toggleOwnerId,
    tagIds,
    toggleTagId,
    setTagIds,
  } = useAnalyticsFilters()

  const state = useFunnelPageState()

  // Pipeline do produto ativo — fonte canônica das etapas (não depende do retorno da RPC)
  const { pipelineId } = useCurrentProductMeta()
  const { data: pipelineStages = [] } = usePipelineStages(pipelineId ?? undefined)

  const profileId = profile?.id ?? null
  const isMyFunnel = !!(profileId && ownerIds.length === 1 && ownerIds[0] === profileId)

  /** "Meu Funil" preserva a seleção anterior ao alternar:
   *    - clicar quando desligado → marca apenas o próprio profileId
   *    - clicar quando ligado → volta para o último conjunto que havia antes
   *  (Implementação simples: usa ref em memória via closures do setOwnerIds.)
   */
  const toggleMyFunnel = useCallback(() => {
    if (!profileId) return
    setOwnerIds(isMyFunnel ? [] : [profileId])
  }, [profileId, isMyFunnel, setOwnerIds])

  // Dados dos pickers
  const { data: profileOptions = [] } = useFilterProfiles()
  const { data: teamData = [] } = useFilterTeams()
  const { data: tagData = [] } = useFilterTags()

  // Owners agrupados: cada time vira uma seção. Primeira opção da seção é o time
  // inteiro (marca todos os membros); abaixo vêm as pessoas individualmente.
  // Pessoas sem time (ou com team_id apontando pra time de outro workspace) caem
  // numa seção final "Sem time".
  const ownerSections: PickerSection[] = useMemo(() => {
    const profileMap = new Map(profileOptions.map(p => [p.id, p.nome || '(sem nome)']))
    const sections: PickerSection[] = []
    const accountedIds = new Set<string>()

    for (const team of teamData) {
      const members = team.memberIds
        .filter(id => profileMap.has(id))
        .map(id => ({ id, label: profileMap.get(id)! }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
      if (members.length === 0) continue
      members.forEach(m => accountedIds.add(m.id))

      sections.push({
        label: team.name,
        options: [
          {
            id: `team:${team.id}`,
            label: `Todos de ${team.name}`,
            badge: `${members.length}`,
            expandTo: members.map(m => m.id),
            matchByExpand: true,
          },
          ...members,
        ],
      })
    }

    const orphan = profileOptions
      .filter(p => !accountedIds.has(p.id))
      .map(p => ({ id: p.id, label: p.nome || '(sem nome)' }))
    if (orphan.length > 0) {
      sections.push({ label: 'Sem time', options: orphan })
    }

    return sections
  }, [teamData, profileOptions])

  const tagOptions: PickerOption[] = useMemo(
    () => tagData.map(t => ({ id: t.id, label: t.name })),
    [tagData]
  )

  // Handler do picker: se a opção tem expandTo (time), alterna todos os membros em bloco.
  const handleToggleOwner = useCallback(
    (id: string, expandTo?: string[]) => {
      if (expandTo && expandTo.length > 0) {
        const allSelected = expandTo.every(mid => ownerIds.includes(mid))
        if (allSelected) {
          setOwnerIds(ownerIds.filter(oid => !expandTo.includes(oid)))
        } else {
          const merged = Array.from(new Set([...ownerIds, ...expandTo]))
          setOwnerIds(merged)
        }
      } else {
        toggleOwnerId(id)
      }
    },
    [ownerIds, setOwnerIds, toggleOwnerId]
  )

  const funnelParams = useMemo(
    () => ({
      dateStart: dateRange.start,
      dateEnd: dateRange.end,
      product,
      dateRef: state.dateRef,
      status: state.status,
      ganhoFase: state.ganhoFase,
      rootStageId: state.rootStageId,
      ownerIds,
      tagIds,
    }),
    [
      dateRange.start,
      dateRange.end,
      product,
      state.dateRef,
      state.status,
      state.ganhoFase,
      state.rootStageId,
      ownerIds,
      tagIds,
    ]
  )

  const {
    conversion: rawConversion,
    lossReasons,
    velocity: rawVelocity,
    previousConversion: rawPreviousConversion,
    previousRange,
    conversionLoading,
    lossLoading,
    velocityLoading,
    previousLoading,
    conversionError,
    lossError,
    velocityError,
    anyError,
    refetch,
  } = useFunnelData(funnelParams, state.compareEnabled)

  // StageOptions: etapas reais do pipeline ativo (não dependem do retorno da RPC).
  // Isso evita ficar com dropdown vazio quando a RPC retorna 0 stages.
  const stageOptions: StageOption[] = useMemo(
    () =>
      pipelineStages.map((s, idx) => ({
        id: s.id,
        nome: s.nome,
        ordem: idx,
      })),
    [pipelineStages]
  )

  // Recorte do funil pela etapa raiz (visual): se rootStageId estiver set, corta
  // o retorno da RPC da etapa raiz pra frente. A RPC v3 já filtra o universo de
  // cards por "passou por essa etapa" quando p_stage_id é informado.
  const rootIndex = useMemo(() => {
    if (!state.rootStageId) return 0
    const idx = rawConversion.findIndex(s => s.stage_id === state.rootStageId)
    return idx >= 0 ? idx : 0
  }, [state.rootStageId, rawConversion])

  const conversion = useMemo(
    () => (rootIndex === 0 ? rawConversion : rawConversion.slice(rootIndex)),
    [rawConversion, rootIndex]
  )

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
        drillDateRef: state.dateRef,
      })
    },
    [drillDown, state.dateRef]
  )

  const handleReasonDrill = useCallback(
    (reason: string) => {
      drillDown.open({
        label: `Perdidos: ${reason || 'Sem motivo'}`,
        drillLossReason: reason,
        drillStatus: 'perdido',
        drillSource: 'lost_deals',
        drillStageId: state.rootStageId ?? undefined,
        drillDateRef: state.dateRef,
      })
    },
    [drillDown, state.rootStageId, state.dateRef]
  )

  const conversionAndKpisLoading = conversionLoading || (state.compareEnabled && previousLoading)

  return (
    <div className="space-y-5">
      {anyError && (
        <QueryErrorState
          compact
          title={
            conversionError
              ? 'Erro ao carregar funil'
              : velocityError
                ? 'Erro ao carregar velocidade'
                : lossError
                  ? 'Erro ao carregar motivos de perda'
                  : 'Erro ao carregar dados'
          }
          onRetry={refetch}
        />
      )}

      <FunnelFilterPanel
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        dateRef={state.dateRef}
        setDateRef={state.setDateRef}
        metric={state.metric}
        setMetric={state.setMetric}
        status={state.status}
        setStatus={state.setStatus}
        ganhoFase={state.ganhoFase}
        setGanhoFase={state.setGanhoFase}
        compareEnabled={state.compareEnabled}
        setCompareEnabled={state.setCompareEnabled}
        previousRange={previousRange}
        profileId={profileId}
        isMyFunnel={isMyFunnel}
        onToggleMyFunnel={toggleMyFunnel}
        ownerSections={ownerSections}
        selectedOwnerIds={ownerIds}
        onToggleOwner={handleToggleOwner}
        onClearOwners={() => setOwnerIds([])}
        tagOptions={tagOptions}
        selectedTagIds={tagIds}
        onToggleTag={toggleTagId}
        onClearTags={() => setTagIds([])}
        stageOptions={stageOptions}
        rootStageId={state.rootStageId}
        setRootStageId={state.setRootStageId}
      />

      <FunnelKpis
        isLoading={conversionAndKpisLoading}
        stages={conversion}
        previousStages={previousConversion}
        metric={state.metric}
        status={state.status}
        compareEnabled={state.compareEnabled}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FunnelVisual
            isLoading={conversionAndKpisLoading}
            stages={conversion}
            previousStages={previousConversion}
            metric={state.metric}
            compareEnabled={state.compareEnabled}
            onStageDrill={handleStageDrill}
          />
        </div>
        <div>
          <FunnelLossReasons
            isLoading={lossLoading}
            reasons={lossReasons}
            onReasonDrill={handleReasonDrill}
          />
        </div>
      </div>

      <FunnelVelocityTable isLoading={velocityLoading} rows={velocity} />
    </div>
  )
}
