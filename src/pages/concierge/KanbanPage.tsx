import { useMemo, useState } from 'react'
import { ListChecks, Plane, User as UserIcon, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { type TipoConcierge, type SourceConcierge } from '../../hooks/concierge/types'
import { type JanelaEmbarque } from '../../hooks/concierge/useKanbanTarefas'
import { useKanbanTarefas } from '../../hooks/concierge/useKanbanTarefas'
import { useKanbanViagens } from '../../hooks/concierge/useKanbanViagens'
import { ConciergeKanbanBoard } from '../../components/concierge/kanban/ConciergeKanbanBoard'
import { ConciergeViagensBoard } from '../../components/concierge/kanban/ConciergeViagensBoard'
import { KanbanFiltersBar } from '../../components/concierge/kanban/KanbanFiltersBar'
import { cn } from '../../lib/utils'

type Modo = 'tarefas' | 'viagens'

export default function KanbanPage() {
  const { profile } = useAuth()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const [modo, setModo] = useState<Modo>('tarefas')
  const [showAll, setShowAll] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<Set<TipoConcierge>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<Set<SourceConcierge>>(new Set())
  const [janelaFilter, setJanelaFilter] = useState<Set<JanelaEmbarque>>(new Set())
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<{ id: string; titulo: string } | null>(null)

  const donoId = !showAll && profile?.id ? profile.id : null

  const tarefasFilters = useMemo(
    () => ({
      donoId,
      tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
      sources: sourceFilter.size > 0 ? Array.from(sourceFilter) : undefined,
      janelas: janelaFilter.size > 0 ? Array.from(janelaFilter) : undefined,
      cardIds: cardFilter ? [cardFilter.id] : undefined,
      search: search.trim() || undefined,
    }),
    [donoId, tipoFilter, sourceFilter, janelaFilter, cardFilter, search]
  )

  const viagensFilters = useMemo(
    () => ({
      donoId,
      tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
    }),
    [donoId, tipoFilter]
  )

  const { data: tarefas } = useKanbanTarefas(modo === 'tarefas' ? tarefasFilters : { donoId: null })
  const { data: viagens } = useKanbanViagens(modo === 'viagens' ? viagensFilters : { donoId: null })

  const totalTarefas = tarefas?.length ?? 0
  const totalViagens = viagens?.length ?? 0
  const count = modo === 'tarefas' ? totalTarefas : totalViagens

  const toggleSet = <T,>(set: Set<T>, setter: (s: Set<T>) => void, k: T) => {
    const next = new Set(set)
    if (next.has(k)) next.delete(k); else next.add(k)
    setter(next)
  }

  const hasAnyFilter = (
    tipoFilter.size > 0 ||
    sourceFilter.size > 0 ||
    janelaFilter.size > 0 ||
    !!cardFilter ||
    !!search.trim()
  )

  const clearAll = () => {
    setTipoFilter(new Set())
    setSourceFilter(new Set())
    setJanelaFilter(new Set())
    setCardFilter(null)
    setSearch('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex bg-slate-100 rounded-md p-0.5">
            <button
              onClick={() => setModo('tarefas')}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                modo === 'tarefas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Por tarefa
            </button>
            <button
              onClick={() => setModo('viagens')}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                modo === 'viagens' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Plane className="w-3.5 h-3.5" />
              Por viagem
            </button>
          </div>

          <div className="text-[12px] text-slate-500 font-mono">
            {count} {count === 1 ? (modo === 'tarefas' ? 'tarefa' : 'viagem') : (modo === 'tarefas' ? 'tarefas' : 'viagens')}
          </div>

          {produtoAtual && (
            <span className="text-[10.5px] text-slate-400 font-mono uppercase tracking-wide">{produtoAtual}</span>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-slate-500">Ver:</span>
            <div className="inline-flex bg-slate-100 rounded-md p-0.5">
              <button
                onClick={() => setShowAll(false)}
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                  !showAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <UserIcon className="w-3 h-3" />
                Minha fila
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                  showAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Users className="w-3 h-3" />
                Time todo
              </button>
            </div>
          </div>
        </div>

        <KanbanFiltersBar
          search={search}
          onSearchChange={setSearch}
          tipoFilter={tipoFilter}
          onToggleTipo={(t) => toggleSet(tipoFilter, setTipoFilter, t)}
          janelaFilter={janelaFilter}
          onToggleJanela={(j) => toggleSet(janelaFilter, setJanelaFilter, j)}
          sourceFilter={sourceFilter}
          onToggleSource={(s) => toggleSet(sourceFilter, setSourceFilter, s)}
          cardFilter={cardFilter}
          onClearCard={() => setCardFilter(null)}
          onClearAll={clearAll}
          hasAnyFilter={hasAnyFilter}
          showJanelaAndSource={modo === 'tarefas'}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {modo === 'tarefas'
          ? <ConciergeKanbanBoard filters={tarefasFilters} />
          : <ConciergeViagensBoard filters={viagensFilters} />}
      </div>
    </div>
  )
}
