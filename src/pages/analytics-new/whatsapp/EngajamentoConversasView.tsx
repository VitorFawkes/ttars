import { useMemo, useState } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useEngajamentoConversas } from '@/hooks/analytics/useEngajamentoConversas'
import type {
  EngajamentoConversation,
  EngajamentoFilters,
} from '@/types/engagement'
import EngajamentoFiltros from './EngajamentoFiltros'
import EngajamentoKpis from './EngajamentoKpis'
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
    linhaIds: [],
    attributionModes: [],
    stateFilter: [],
    includeTestLines: false,
    coldThresholdHours: 48,
  }
}

export default function EngajamentoConversasView() {
  const [filters, setFilters] = useState<EngajamentoFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [selectedConversation, setSelectedConversation] = useState<EngajamentoConversation | null>(null)

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useEngajamentoConversas({ filters, page, limit: 50 })

  const lines = useMemo(() => data?.lines ?? [], [data?.lines])

  function handleFilterChange(updates: Partial<EngajamentoFilters>) {
    setFilters(prev => ({ ...prev, ...updates }))
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          Engajamento de Conversas
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Quem responde, quem some, quanto demora pra primeira resposta — em todas as linhas de WhatsApp da Welcome Weddings.
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

      <EngajamentoKpis kpis={data?.kpis} isLoading={isLoading} />

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
