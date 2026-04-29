import { useMemo, useState } from 'react'
import { ListChecks, Plane, User as UserIcon, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { TIPO_LABEL, type TipoConcierge } from '../../hooks/concierge/types'
import { useKanbanTarefas } from '../../hooks/concierge/useKanbanTarefas'
import { useKanbanViagens } from '../../hooks/concierge/useKanbanViagens'
import { ConciergeKanbanBoard } from '../../components/concierge/kanban/ConciergeKanbanBoard'
import { ConciergeViagensBoard } from '../../components/concierge/kanban/ConciergeViagensBoard'
import { cn } from '../../lib/utils'

type Modo = 'tarefas' | 'viagens'

export default function KanbanPage() {
  const { profile } = useAuth()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const [modo, setModo] = useState<Modo>('tarefas')
  const [showAll, setShowAll] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<Set<TipoConcierge>>(new Set())

  const donoId = !showAll && profile?.id ? profile.id : null

  const filters = useMemo(
    () => ({
      donoId,
      tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
    }),
    [donoId, tipoFilter]
  )

  const { data: tarefas } = useKanbanTarefas(modo === 'tarefas' ? filters : { donoId: null })
  const { data: viagens } = useKanbanViagens(modo === 'viagens' ? filters : { donoId: null })

  const totalTarefas = tarefas?.length ?? 0
  const totalViagens = viagens?.length ?? 0
  const count = modo === 'tarefas' ? totalTarefas : totalViagens

  const toggleTipo = (t: TipoConcierge) => {
    const n = new Set(tipoFilter)
    if (n.has(t)) n.delete(t); else n.add(t)
    setTipoFilter(n)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
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

        <div
          className="flex items-center gap-2 mt-3 -mb-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <span className="text-[11px] text-slate-500 shrink-0">Tipo:</span>
          {(Object.entries(TIPO_LABEL) as [TipoConcierge, typeof TIPO_LABEL[TipoConcierge]][]).map(([key, meta]) => {
            const active = tipoFilter.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleTipo(key)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11.5px] font-medium border transition-colors',
                  active
                    ? `${meta.bgColor} ${meta.color} ${meta.borderColor}`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotColor)} />
                {meta.label}
              </button>
            )
          })}
          {tipoFilter.size > 0 && (
            <button
              onClick={() => setTipoFilter(new Set())}
              className="shrink-0 text-[11.5px] text-slate-500 hover:text-slate-700 ml-1"
            >
              limpar
            </button>
          )}
          {produtoAtual && (
            <>
              <div className="w-px h-5 bg-slate-200 mx-1" />
              <span className="shrink-0 text-[11px] text-slate-500 font-mono uppercase tracking-wide">{produtoAtual}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {modo === 'tarefas'
          ? <ConciergeKanbanBoard filters={filters} />
          : <ConciergeViagensBoard filters={filters} />}
      </div>
    </div>
  )
}
