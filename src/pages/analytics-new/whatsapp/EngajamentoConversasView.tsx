import { useMemo, useState } from 'react'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useEngajamentoConversas } from '@/hooks/analytics/useEngajamentoConversas'
import type {
  ConversationState,
  EngajamentoConversation,
  EngajamentoDepthBucket,
  EngajamentoFilters,
} from '@/types/engagement'
import EngajamentoFiltros from './EngajamentoFiltros'
import EngajamentoHeroKpis from './EngajamentoHeroKpis'
import EngajamentoSecondaryKpis from './EngajamentoSecondaryKpis'
import EngajamentoBreakdownLinhas from './EngajamentoBreakdownLinhas'
import EngajamentoDistribuicoes from './EngajamentoDistribuicoes'
import EngajamentoFRTBuckets from './EngajamentoFRTBuckets'
import EngajamentoHeatmap from './EngajamentoHeatmap'
import EngajamentoTimeMetrics from './EngajamentoTimeMetrics'
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

  // Single-active state (for highlighting): só destaca quando tem só 1 estado selecionado
  const activeState: ConversationState | null =
    filters.stateFilter.length === 1 ? filters.stateFilter[0] : null

  // Filtro client-side de depth bucket (RPC ainda não tem param dedicado)
  const filteredConversations = useMemo(() => {
    const list = data?.conversations ?? []
    if (filters.inboundMin === null && filters.inboundMax === null) return list
    return list.filter(c => {
      const n = c.inbound_count
      if (filters.inboundMin !== null && n < filters.inboundMin) return false
      if (filters.inboundMax !== null && n > filters.inboundMax) return false
      return true
    })
  }, [data?.conversations, filters.inboundMin, filters.inboundMax])

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
          Quem responde, quem some, em quanto tempo, e como cada linha se compara — Welcome Weddings.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngajamentoFRTBuckets buckets={data?.frt_distribution ?? []} isLoading={isLoading} />
        <EngajamentoHeatmap cells={data?.weekday_hour_heatmap ?? []} isLoading={isLoading} />
      </div>

      <EngajamentoTimeMetrics metrics={data?.time_metrics} isLoading={isLoading} />

      <EngajamentoDistribuicoes
        states={data?.state_distribution ?? []}
        depths={data?.depth_histogram ?? []}
        isLoading={isLoading}
        activeState={activeState}
        onToggleState={toggleState}
        activeDepthBucket={activeDepthBucket?.bucket ?? null}
        onToggleDepthBucket={toggleDepthBucket}
      />

      <EngajamentoFunil steps={data?.funnel ?? []} isLoading={isLoading} />

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
