import { useMemo, useState } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useEngajamentoConversas } from '@/hooks/analytics/useEngajamentoConversas'
import type {
  ConversationState,
  EngajamentoConversation,
  EngajamentoFilters,
} from '@/types/engagement'
import EngajamentoFiltros from './EngajamentoFiltros'
import EngajamentoHeroKpis from './EngajamentoHeroKpis'
import EngajamentoSecondaryKpis from './EngajamentoSecondaryKpis'
import EngajamentoBreakdownLinhas from './EngajamentoBreakdownLinhas'
import EngajamentoDistribuicoes from './EngajamentoDistribuicoes'
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
  }
}

export default function EngajamentoConversasView() {
  const [filters, setFilters] = useState<EngajamentoFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [selectedConversation, setSelectedConversation] =
    useState<EngajamentoConversation | null>(null)

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

  // Single-active state (for highlighting): só destaca quando tem só 1 estado selecionado
  const activeState: ConversationState | null =
    filters.stateFilter.length === 1 ? filters.stateFilter[0] : null

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Engajamento de Conversas
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Quem responde, quem some, quanto demora a primeira resposta — em todas as linhas de
          WhatsApp da Welcome Weddings.
        </p>
      </div>

      <EngajamentoFiltros
        filters={filters}
        onChange={handleFilterChange}
        lines={lines}
        isLoading={isFetching}
      />

      {error && (
        <QueryErrorState
          title="Erro ao carregar dados de engajamento"
          onRetry={() => refetch()}
        />
      )}

      <EngajamentoHeroKpis kpis={data?.kpis} isLoading={isLoading} />

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

      <EngajamentoDistribuicoes
        states={data?.state_distribution ?? []}
        depths={data?.depth_histogram ?? []}
        isLoading={isLoading}
        activeState={activeState}
        onToggleState={toggleState}
      />

      <EngajamentoFunil steps={data?.funnel ?? []} isLoading={isLoading} />

      <EngajamentoTabela
        conversations={data?.conversations ?? []}
        isLoading={isLoading}
        pagination={data?.pagination ?? { page: 1, limit: 50, total: 0 }}
        onPageChange={setPage}
        onRowClick={setSelectedConversation}
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
