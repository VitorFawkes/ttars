import { useMemo, useState } from 'react'
import { ListChecks, Plane, AlarmClock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useKanbanTarefas } from '../../hooks/concierge/useKanbanTarefas'
import { useKanbanViagens } from '../../hooks/concierge/useKanbanViagens'
import { useConciergePreferences, type Modo } from '../../hooks/concierge/useConciergePreferences'
import { useCardTagsLookup } from '../../hooks/concierge/useCardTagsLookup'
import { ConciergeKanbanBoard } from '../../components/concierge/kanban/ConciergeKanbanBoard'
import { ConciergeViagensBoard } from '../../components/concierge/kanban/ConciergeViagensBoard'
import { KanbanFiltersBar } from '../../components/concierge/kanban/KanbanFiltersBar'
import { cn } from '../../lib/utils'

export default function KanbanPage() {
  const { profile } = useAuth()
  const { slug: produtoAtual, pipelineId } = useCurrentProductMeta()
  const { prefs, setPref, toggleSet, clearAll, hasAnyFilter } = useConciergePreferences()

  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<{ id: string; titulo: string } | null>(null)

  const { data: tagLookup } = useCardTagsLookup()

  // donoFilter: 'me' = profile.id, 'all' = null, ou specific profile id
  const donoId = prefs.donoFilter === 'me'
    ? (profile?.id ?? null)
    : prefs.donoFilter === 'all'
      ? null
      : prefs.donoFilter

  const tarefasFilters = useMemo(
    () => ({
      donoId,
      tipos: prefs.tipos.length > 0 ? prefs.tipos : undefined,
      sources: prefs.sources.length > 0 ? prefs.sources : undefined,
      janelas: prefs.janelas.length > 0 ? prefs.janelas : undefined,
      categorias: prefs.categorias.length > 0 ? prefs.categorias : undefined,
      tagFilter: prefs.tagIds.length > 0 && tagLookup
        ? { tagIds: prefs.tagIds, lookup: tagLookup }
        : undefined,
      cardIds: cardFilter ? [cardFilter.id] : undefined,
      search: search.trim() || undefined,
      mostrarConcluidosAntigos: prefs.mostrarConcluidosAntigos,
    }),
    [donoId, prefs.tipos, prefs.sources, prefs.janelas, prefs.categorias, prefs.tagIds, prefs.mostrarConcluidosAntigos, tagLookup, cardFilter, search]
  )

  const viagensFilters = useMemo(
    () => ({
      donoId,
      tipos: prefs.tipos.length > 0 ? prefs.tipos : undefined,
      sources: prefs.sources.length > 0 ? prefs.sources : undefined,
      janelas: prefs.janelas.length > 0 ? prefs.janelas : undefined,
      categorias: prefs.categorias.length > 0 ? prefs.categorias : undefined,
      tagFilter: prefs.tagIds.length > 0 && tagLookup
        ? { tagIds: prefs.tagIds, lookup: tagLookup }
        : undefined,
      cardIds: cardFilter ? [cardFilter.id] : undefined,
      search: search.trim() || undefined,
      pipelineId: pipelineId ?? null,
    }),
    [donoId, prefs.tipos, prefs.sources, prefs.janelas, prefs.categorias, prefs.tagIds, tagLookup, cardFilter, search, pipelineId]
  )

  const { data: tarefas, rawData: rawTarefas } = useKanbanTarefas(prefs.modo === 'tarefas' ? tarefasFilters : { donoId: null })
  const { data: viagens } = useKanbanViagens(prefs.modo === 'viagens' ? viagensFilters : { donoId: null })

  const totalTarefas = tarefas?.length ?? 0
  const totalViagens = viagens?.length ?? 0
  const count = prefs.modo === 'tarefas' ? totalTarefas : totalViagens

  // Conta cards estocados em "Agendados para o futuro" cujo prazo da tarefa
  // (data_vencimento) chega em <=7d (inclui as que já passaram — esses são
  // o sinal mais forte). O concierge_em_futuro é o flag sticky.
  const chegandoEssaSemana = useMemo(() => {
    if (prefs.modo !== 'tarefas' || !tarefas) return 0
    const limite = Date.now() + 7 * 24 * 60 * 60 * 1000
    return tarefas.filter(t => {
      if (!t.concierge_em_futuro || !t.data_vencimento) return false
      const data = new Date(t.data_vencimento).getTime()
      return Number.isFinite(data) && data <= limite
    }).length
  }, [tarefas, prefs.modo])

  const setModo = (m: Modo) => setPref('modo', m)

  const handleClearAll = () => {
    clearAll()
    setSearch('')
    setCardFilter(null)
  }

  const filterBarHasAny = hasAnyFilter || !!cardFilter || !!search.trim()

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex bg-slate-100 rounded-md p-0.5">
            <button
              onClick={() => setModo('tarefas')}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                prefs.modo === 'tarefas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Por tarefa
            </button>
            <button
              onClick={() => setModo('viagens')}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                prefs.modo === 'viagens' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Plane className="w-3.5 h-3.5" />
              Por viagem
            </button>
          </div>

          <div className="text-[12px] text-slate-500 font-mono">
            {count} {count === 1 ? (prefs.modo === 'tarefas' ? 'tarefa' : 'viagem') : (prefs.modo === 'tarefas' ? 'tarefas' : 'viagens')}
          </div>

          {chegandoEssaSemana > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
              title="Atendimentos estocados em 'Agendados para o futuro' com prazo planejado essa semana (inclui as datas que já passaram)"
            >
              <AlarmClock className="w-3 h-3" />
              {chegandoEssaSemana} com prazo chegando
            </span>
          )}

          {produtoAtual && (
            <span className="text-[10.5px] text-slate-400 font-mono uppercase tracking-wide">{produtoAtual}</span>
          )}
        </div>

        <KanbanFiltersBar
          search={search}
          onSearchChange={setSearch}
          donoFilter={prefs.donoFilter}
          onDonoFilterChange={(d) => setPref('donoFilter', d)}
          tipoFilter={prefs.tipos}
          onToggleTipo={(t) => toggleSet('tipos', t)}
          janelaFilter={prefs.janelas}
          onToggleJanela={(j) => toggleSet('janelas', j)}
          sourceFilter={prefs.sources}
          onToggleSource={(s) => toggleSet('sources', s)}
          categoriaFilter={prefs.categorias}
          onToggleCategoria={(c) => toggleSet('categorias', c)}
          tagFilter={prefs.tagIds}
          onToggleTag={(t) => toggleSet('tagIds', t)}
          cardFilter={cardFilter}
          onSelectCard={setCardFilter}
          mostrarConcluidosAntigos={prefs.mostrarConcluidosAntigos}
          onToggleMostrarConcluidosAntigos={() => setPref('mostrarConcluidosAntigos', v => !v)}
          onClearAll={handleClearAll}
          hasAnyFilter={filterBarHasAny}
          showAdvanced={true}
          tarefas={rawTarefas ?? []}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {prefs.modo === 'tarefas'
          ? <ConciergeKanbanBoard filters={tarefasFilters} />
          : <ConciergeViagensBoard filters={viagensFilters} />}
      </div>
    </div>
  )
}
