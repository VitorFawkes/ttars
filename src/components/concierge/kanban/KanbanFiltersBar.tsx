import { Search, X } from 'lucide-react'
import { TIPO_LABEL, SOURCE_LABEL, CATEGORIAS_CONCIERGE, type TipoConcierge, type SourceConcierge } from '../../../hooks/concierge/types'
import { JANELA_LABEL, JANELA_ORDER, type JanelaEmbarque, type KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'
import { SourceIcon } from '../Badges'
import { ConsultorPicker } from './ConsultorPicker'
import { MoreFiltersPopover } from './MoreFiltersPopover'
import { useFilterTags } from '../../../hooks/analytics/useFilterOptions'
import type { DonoFilter } from '../../../hooks/concierge/useConciergePreferences'
import { cn } from '../../../lib/utils'

interface KanbanFiltersBarProps {
  search: string
  onSearchChange: (v: string) => void

  donoFilter: DonoFilter
  onDonoFilterChange: (next: DonoFilter) => void

  tipoFilter: TipoConcierge[]
  onToggleTipo: (t: TipoConcierge) => void

  janelaFilter: JanelaEmbarque[]
  onToggleJanela: (j: JanelaEmbarque) => void

  sourceFilter: SourceConcierge[]
  onToggleSource: (s: SourceConcierge) => void

  categoriaFilter: string[]
  onToggleCategoria: (key: string) => void

  tagFilter: string[]
  onToggleTag: (id: string) => void

  cardFilter: { id: string; titulo: string } | null
  onSelectCard: (card: { id: string; titulo: string } | null) => void

  onClearAll: () => void
  hasAnyFilter: boolean

  showAdvanced?: boolean
  tarefas: KanbanTarefaItem[]
}

export function KanbanFiltersBar({
  search,
  onSearchChange,
  donoFilter,
  onDonoFilterChange,
  tipoFilter,
  onToggleTipo,
  janelaFilter,
  onToggleJanela,
  sourceFilter,
  onToggleSource,
  categoriaFilter,
  onToggleCategoria,
  tagFilter,
  onToggleTag,
  cardFilter,
  onSelectCard,
  onClearAll,
  hasAnyFilter,
  showAdvanced = true,
  tarefas,
}: KanbanFiltersBarProps) {
  const { data: allTags = [] } = useFilterTags()

  const activeChips: { key: string; label: string; onRemove: () => void }[] = []
  if (cardFilter) {
    activeChips.push({
      key: `card-${cardFilter.id}`,
      label: `Viagem: ${cardFilter.titulo}`,
      onRemove: () => onSelectCard(null),
    })
  }
  for (const c of categoriaFilter) {
    const cat = CATEGORIAS_CONCIERGE[c as keyof typeof CATEGORIAS_CONCIERGE]
    activeChips.push({
      key: `cat-${c}`,
      label: `Categoria: ${cat?.label ?? c}`,
      onRemove: () => onToggleCategoria(c),
    })
  }
  for (const id of tagFilter) {
    const tag = allTags.find(t => t.id === id)
    activeChips.push({
      key: `tag-${id}`,
      label: `Tag: ${tag?.name ?? id}`,
      onRemove: () => onToggleTag(id),
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
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

        <ConsultorPicker value={donoFilter} onChange={onDonoFilterChange} />

        {showAdvanced && (
          <MoreFiltersPopover
            categoriasFilter={categoriaFilter}
            onToggleCategoria={onToggleCategoria}
            tagFilter={tagFilter}
            onToggleTag={onToggleTag}
            cardFilter={cardFilter}
            onSelectCard={onSelectCard}
            tarefas={tarefas}
          />
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
          const active = tipoFilter.includes(key)
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

        {showAdvanced && (
          <>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
            <span className="text-[11px] text-slate-500 shrink-0">Embarque:</span>
            {JANELA_ORDER.map(j => {
              const active = janelaFilter.includes(j)
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
              const active = sourceFilter.includes(key)
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

      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {activeChips.map(chip => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium max-w-[260px]"
            >
              <span className="truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="ml-0.5 p-0.5 rounded hover:bg-indigo-100"
                aria-label="Remover filtro"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
