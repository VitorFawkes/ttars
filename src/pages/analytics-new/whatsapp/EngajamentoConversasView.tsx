import { useMemo, useState } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useEngajamentoConversas } from '@/hooks/analytics/useEngajamentoConversas'
import type {
  ConversationState,
  EngajamentoConversation,
  EngajamentoDepthBucket,
  EngajamentoFilters,
  EngajamentoFunnelStep,
  MeetingState,
} from '@/types/engagement'
import EngajamentoFiltros from './EngajamentoFiltros'
import EngajamentoHeroKpis from './EngajamentoHeroKpis'
import EngajamentoSecondaryKpis from './EngajamentoSecondaryKpis'
import EngajamentoBreakdownLinhas from './EngajamentoBreakdownLinhas'
import EngajamentoDistribuicoes from './EngajamentoDistribuicoes'
import EngajamentoFRTBuckets from './EngajamentoFRTBuckets'
import EngajamentoHeatmap from './EngajamentoHeatmap'
import EngajamentoTimelineDiaria from './EngajamentoTimelineDiaria'
import EngajamentoVelocidadeDia from './EngajamentoVelocidadeDia'
import EngajamentoTimeMetrics from './EngajamentoTimeMetrics'
import EngajamentoReunioes from './EngajamentoReunioes'
import EngajamentoSegmentos from './EngajamentoSegmentos'
import EngajamentoFunil from './EngajamentoFunil'
import EngajamentoTabela from './EngajamentoTabela'
import EngajamentoConversaDrawer from './EngajamentoConversaDrawer'

function defaultFilters(): EngajamentoFilters {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    lineLabels: [],
    attributionModes: [],
    stateFilter: [],
    includeTestLines: false,
    coldThresholdHours: 48,
    inboundMin: null,
    inboundMax: null,
    weekdayFilter: null,
    hourFilter: null,
    meetingStates: [],
    stageNames: [],
    stagePhases: [],
  }
}

export default function EngajamentoConversasView() {
  const [filters, setFilters] = useState<EngajamentoFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [selectedConversation, setSelectedConversation] =
    useState<EngajamentoConversation | null>(null)
  const [activeDepthBucket, setActiveDepthBucket] = useState<EngajamentoDepthBucket | null>(null)

  const { data, isLoading, isFetching, error, refetch } = useEngajamentoConversas({
    filters,
    page,
    limit: 50,
  })

  const lines = useMemo(() => data?.lines ?? [], [data?.lines])

  function handleFilterChange(updates: Partial<EngajamentoFilters>) {
    setFilters(prev => ({ ...prev, ...updates }))
    setPage(1)
  }

  function toggleLine(label: string) {
    const set = new Set(filters.lineLabels)
    if (set.has(label)) set.delete(label)
    else set.add(label)
    handleFilterChange({ lineLabels: Array.from(set) })
  }

  function toggleState(state: ConversationState) {
    const set = new Set(filters.stateFilter)
    if (set.has(state)) set.delete(state)
    else set.add(state)
    handleFilterChange({ stateFilter: Array.from(set) })
  }

  function toggleDepthBucket(bucket: EngajamentoDepthBucket | null) {
    if (!bucket) {
      setActiveDepthBucket(null)
      handleFilterChange({ inboundMin: null, inboundMax: null })
      return
    }
    setActiveDepthBucket(bucket)
    handleFilterChange({ inboundMin: bucket.min, inboundMax: bucket.max })
  }

  function setHeatmapCell(weekday: number | null, hour: number | null) {
    handleFilterChange({ weekdayFilter: weekday, hourFilter: hour })
  }

  const RESET_DERIVED: Partial<EngajamentoFilters> = {
    stateFilter: [],
    inboundMin: null,
    inboundMax: null,
    meetingStates: [],
    stageNames: [],
  }

  function applyFunnelStep(step: EngajamentoFunnelStep) {
    // Toggle: se já está com esse filtro ativo, limpa
    const isActiveStep = activeFunnelStep === step.step
    if (isActiveStep) {
      handleFilterChange(RESET_DERIVED)
      setActiveDepthBucket(null)
      return
    }
    setActiveDepthBucket(null)
    switch (step.step) {
      case 'Contatado':
        handleFilterChange(RESET_DERIVED)
        return
      case 'Respondeu 1x':
        handleFilterChange({ ...RESET_DERIVED, inboundMin: 1 })
        return
      case 'Respondeu 3x':
        handleFilterChange({ ...RESET_DERIVED, inboundMin: 3 })
        return
      case 'Reunião Agendada':
        handleFilterChange({
          ...RESET_DERIVED,
          meetingStates: ['meeting_scheduled', 'meeting_done'] as MeetingState[],
        })
        return
      case 'Reunião Feita':
        handleFilterChange({
          ...RESET_DERIVED,
          meetingStates: ['meeting_done'] as MeetingState[],
        })
        return
      case 'Proposta':
        handleFilterChange({
          ...RESET_DERIVED,
          stageNames: ['Proposta', 'Proposta Enviada', 'Negociação', 'Contrato Assinado'],
        })
        return
      case 'Ganhou':
        handleFilterChange({ ...RESET_DERIVED, stateFilter: ['won'] })
        return
    }
  }

  function applyMeetingCard(key: 'scheduled' | 'done' | 'proposals' | 'contracts') {
    const isActive = activeMeetingKey === key
    if (isActive) {
      handleFilterChange(RESET_DERIVED)
      return
    }
    switch (key) {
      case 'scheduled':
        handleFilterChange({ ...RESET_DERIVED, meetingStates: ['meeting_scheduled'] as MeetingState[] })
        return
      case 'done':
        handleFilterChange({ ...RESET_DERIVED, meetingStates: ['meeting_done'] as MeetingState[] })
        return
      case 'proposals':
        handleFilterChange({
          ...RESET_DERIVED,
          stageNames: ['Proposta', 'Proposta Enviada', 'Negociação', 'Contrato Assinado'],
        })
        return
      case 'contracts':
        handleFilterChange({ ...RESET_DERIVED, stageNames: ['Contrato Assinado'] })
        return
    }
  }

  function applyHeroReplyRate() {
    handleFilterChange({ ...RESET_DERIVED, inboundMin: 1 })
  }

  function applyHeroActive() {
    handleFilterChange({ ...RESET_DERIVED, stateFilter: ['hot', 'warm'] })
  }

  // Single-active state (for highlighting): só destaca quando tem só 1 estado selecionado
  const activeState: ConversationState | null =
    filters.stateFilter.length === 1 ? filters.stateFilter[0] : null

  // Derivar qual step do funil está ativo (pra destacar)
  const activeFunnelStep: string | null = (() => {
    if (filters.stateFilter.length === 1 && filters.stateFilter[0] === 'won') return 'Ganhou'
    if (filters.meetingStates.length === 2 && filters.meetingStates.includes('meeting_scheduled') && filters.meetingStates.includes('meeting_done')) return 'Reunião Agendada'
    if (filters.meetingStates.length === 1 && filters.meetingStates[0] === 'meeting_done') return 'Reunião Feita'
    if (filters.stageNames.length === 4 && filters.stageNames.includes('Proposta') && filters.stageNames.includes('Contrato Assinado')) return 'Proposta'
    if (filters.inboundMin === 3) return 'Respondeu 3x'
    if (filters.inboundMin === 1 && filters.inboundMax === null) return 'Respondeu 1x'
    return null
  })()

  // Qual card de reunião está ativo
  const activeMeetingKey: 'scheduled' | 'done' | 'proposals' | 'contracts' | null = (() => {
    if (filters.meetingStates.length === 1 && filters.meetingStates[0] === 'meeting_scheduled') return 'scheduled'
    if (filters.meetingStates.length === 1 && filters.meetingStates[0] === 'meeting_done') return 'done'
    if (filters.stageNames.length === 1 && filters.stageNames[0] === 'Contrato Assinado') return 'contracts'
    if (filters.stageNames.length === 4 && filters.stageNames.includes('Proposta') && filters.stageNames.includes('Contrato Assinado')) return 'proposals'
    return null
  })()

  // Filtros agora são server-side; conversações chegam já filtradas
  const filteredConversations = data?.conversations ?? []

  const activeTableFilters = useMemo(() => {
    const out: { label: string; onClear: () => void }[] = []
    if (activeDepthBucket) {
      out.push({
        label: `Profundidade: ${activeDepthBucket.bucket}`,
        onClear: () => toggleDepthBucket(null),
      })
    }
    if (filters.stateFilter.length === 1) {
      const s = filters.stateFilter[0]
      const stateLabels: Record<ConversationState, string> = {
        hot: 'Quente',
        warm: 'Morna',
        lost: 'Sumiu',
        cold: 'Nunca respondeu',
        won: 'Ganha',
      }
      out.push({ label: `Estado: ${stateLabels[s]}`, onClear: () => toggleState(s) })
    }
    if (filters.lineLabels.length === 1) {
      out.push({
        label: `Linha: ${filters.lineLabels[0]}`,
        onClear: () => handleFilterChange({ lineLabels: [] }),
      })
    } else if (filters.lineLabels.length > 1) {
      out.push({
        label: `${filters.lineLabels.length} linhas`,
        onClear: () => handleFilterChange({ lineLabels: [] }),
      })
    }
    if (filters.weekdayFilter !== null && filters.hourFilter !== null) {
      const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      out.push({
        label: `Responde ${weekdays[filters.weekdayFilter]} ${String(filters.hourFilter).padStart(2, '0')}h`,
        onClear: () => setHeatmapCell(null, null),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepthBucket, filters.stateFilter, filters.lineLabels])

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Engajamento de Conversas
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Quem responde, quem some, em quanto tempo, e como cada linha se compara na Welcome Weddings.
        </p>
      </div>

      <EngajamentoSegmentos filters={filters} onChange={handleFilterChange} />

      <EngajamentoFiltros
        filters={filters}
        onChange={handleFilterChange}
        lines={lines}
        stages={data?.stages ?? []}
        isLoading={isFetching}
      />

      {error && (
        <QueryErrorState
          title="Erro ao carregar dados de engajamento"
          onRetry={() => refetch()}
        />
      )}

      <EngajamentoHeroKpis
        kpis={data?.kpis}
        isLoading={isLoading}
        onReplyRateClick={applyHeroReplyRate}
        onActiveClick={applyHeroActive}
      />

      <EngajamentoSecondaryKpis
        kpis={data?.kpis}
        isLoading={isLoading}
        activeState={activeState}
        onToggleState={toggleState}
      />

      <EngajamentoBreakdownLinhas
        lines={data?.by_line ?? []}
        isLoading={isLoading}
        selectedLabels={filters.lineLabels}
        onToggleLine={toggleLine}
        onClearLines={() => handleFilterChange({ lineLabels: [] })}
      />

      <EngajamentoTimelineDiaria
        points={data?.daily_timeline ?? []}
        isLoading={isLoading}
      />

      <EngajamentoVelocidadeDia
        points={data?.daily_timeline ?? []}
        isLoading={isLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngajamentoFRTBuckets buckets={data?.frt_distribution ?? []} isLoading={isLoading} />
        <EngajamentoHeatmap
          cells={data?.weekday_hour_heatmap ?? []}
          isLoading={isLoading}
          activeWeekday={filters.weekdayFilter}
          activeHour={filters.hourFilter}
          onCellClick={setHeatmapCell}
        />
      </div>

      <EngajamentoTimeMetrics metrics={data?.time_metrics} isLoading={isLoading} />

      <EngajamentoReunioes
        metrics={data?.meetings_kpis}
        totalContacts={data?.kpis?.total_contacts ?? 0}
        isLoading={isLoading}
        onCardClick={applyMeetingCard}
        activeKey={activeMeetingKey}
      />

      <EngajamentoDistribuicoes
        states={data?.state_distribution ?? []}
        depths={data?.depth_histogram ?? []}
        isLoading={isLoading}
        activeState={activeState}
        onToggleState={toggleState}
        activeDepthBucket={activeDepthBucket?.bucket ?? null}
        onToggleDepthBucket={toggleDepthBucket}
      />

      <EngajamentoFunil
        steps={data?.funnel ?? []}
        isLoading={isLoading}
        onStepClick={applyFunnelStep}
        activeStep={activeFunnelStep}
      />

      <EngajamentoTabela
        conversations={filteredConversations}
        isLoading={isLoading}
        pagination={data?.pagination ?? { page: 1, limit: 50, total: 0 }}
        onPageChange={setPage}
        onRowClick={setSelectedConversation}
        activeFilters={activeTableFilters}
      />

      {selectedConversation && (
        <EngajamentoConversaDrawer
          conversation={selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      )}
    </div>
  )
}
