import { useMemo, useState } from 'react'
import { ListChecks, Plane, Users, User as UserIcon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { TIPO_LABEL, type TipoConcierge } from '../../hooks/concierge/types'
import { ConciergeKanbanBoard } from '../../components/concierge/kanban/ConciergeKanbanBoard'
import { ConciergeViagensBoard } from '../../components/concierge/kanban/ConciergeViagensBoard'
import { cn } from '../../lib/utils'

type Modo = 'tarefas' | 'viagens'

export default function KanbanPage() {
  const { profile } = useAuth()
  const [modo, setModo] = useState<Modo>('tarefas')
  const [showAll, setShowAll] = useState(false)
  const [tipoFilter, setTipoFilter] = useState<Set<TipoConcierge>>(new Set())

  const donoId = !showAll && profile?.id ? profile.id : null

  const filtersTarefas = useMemo(
    () => ({
      donoId,
      tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
    }),
    [donoId, tipoFilter]
  )

  const filtersViagens = useMemo(
    () => ({
      donoId,
      tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
    }),
    [donoId, tipoFilter]
  )

  const toggleTipo = (t: TipoConcierge) => {
    setTipoFilter(s => {
      const n = new Set(s)
      if (n.has(t)) n.delete(t); else n.add(t)
      return n
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModo('tarefas')}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition',
              modo === 'tarefas'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            )}
          >
            <ListChecks className="w-4 h-4" />
            Por tarefa
          </button>
          <button
            type="button"
            onClick={() => setModo('viagens')}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition',
              modo === 'viagens'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            )}
          >
            <Plane className="w-4 h-4" />
            Por viagem
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {(Object.keys(TIPO_LABEL) as TipoConcierge[]).map(t => {
            const active = tipoFilter.has(t)
            const meta = TIPO_LABEL[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTipo(t)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] font-semibold border transition',
                  active
                    ? cn(meta.bgColor, meta.color, meta.borderColor)
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotColor)} />
                {meta.label}
              </button>
            )
          })}

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] font-semibold border transition',
              !showAll
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            )}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Minha fila
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] font-semibold border transition',
              showAll
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Time todo
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {modo === 'tarefas'
          ? <ConciergeKanbanBoard filters={filtersTarefas} />
          : <ConciergeViagensBoard filters={filtersViagens} />}
      </div>
    </div>
  )
}
