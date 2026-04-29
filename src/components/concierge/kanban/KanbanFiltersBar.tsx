import { Search, X } from 'lucide-react'
import { TIPO_LABEL, SOURCE_LABEL, type TipoConcierge, type SourceConcierge } from '../../../hooks/concierge/types'
import { JANELA_LABEL, JANELA_ORDER, type JanelaEmbarque } from '../../../hooks/concierge/useKanbanTarefas'
import { SourceIcon } from '../Badges'
import { cn } from '../../../lib/utils'

interface KanbanFiltersBarProps {
  search: string
  onSearchChange: (v: string) => void

  tipoFilter: Set<TipoConcierge>
  onToggleTipo: (t: TipoConcierge) => void

  janelaFilter: Set<JanelaEmbarque>
  onToggleJanela: (j: JanelaEmbarque) => void

  sourceFilter: Set<SourceConcierge>
  onToggleSource: (s: SourceConcierge) => void

  cardFilter: { id: string; titulo: string } | null
  onClearCard: () => void

  onClearAll: () => void
  hasAnyFilter: boolean

  showJanelaAndSource?: boolean
}

export function KanbanFiltersBar({
  search,
  onSearchChange,
  tipoFilter,
  onToggleTipo,
  janelaFilter,
  onToggleJanela,
  sourceFilter,
  onToggleSource,
  cardFilter,
  onClearCard,
  onClearAll,
  hasAnyFilter,
  showJanelaAndSource = true,
}: KanbanFiltersBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar viagem, cliente, tarefa…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 pl-8 pr-7 text-[12.5px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {cardFilter && (
          <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11.5px] font-medium max-w-[260px]">
            <span className="text-[10px] uppercase tracking-wide opacity-70">Viagem:</span>
            <span className="truncate">{cardFilter.titulo}</span>
            <button
              type="button"
              onClick={onClearCard}
              className="ml-1 p-0.5 rounded hover:bg-indigo-100"
              aria-label="Limpar filtro de viagem"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {hasAnyFilter && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11.5px] text-slate-500 hover:text-slate-700 font-medium ml-auto"
          >
            limpar tudo
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-500 shrink-0">Tipo:</span>
        {(Object.entries(TIPO_LABEL) as [TipoConcierge, typeof TIPO_LABEL[TipoConcierge]][]).map(([key, meta]) => {
          const active = tipoFilter.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleTipo(key)}
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

        {showJanelaAndSource && (
          <>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <span className="text-[11px] text-slate-500 shrink-0">Embarque:</span>
            {JANELA_ORDER.map(j => {
              const active = janelaFilter.has(j)
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => onToggleJanela(j)}
                  className={cn(
                    'shrink-0 inline-flex items-center h-7 px-2 rounded-md text-[11.5px] font-medium border transition-colors',
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {JANELA_LABEL[j]}
                </button>
              )
            })}

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            <span className="text-[11px] text-slate-500 shrink-0">Origem:</span>
            {(Object.entries(SOURCE_LABEL) as [SourceConcierge, typeof SOURCE_LABEL[SourceConcierge]][]).map(([key, meta]) => {
              const active = sourceFilter.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleSource(key)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11.5px] border transition-colors',
                    active
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <SourceIcon source={key} className="w-3 h-3" />
                  {meta.label}
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
