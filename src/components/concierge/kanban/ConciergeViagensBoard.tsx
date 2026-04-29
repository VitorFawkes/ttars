import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useHorizontalScroll } from '../../../hooks/useHorizontalScroll'
import { useKanbanViagens, SAUDE_COLUMNS, type KanbanViagensFilters, type ViagemKanbanItem } from '../../../hooks/concierge/useKanbanViagens'
import { ConciergeKanbanColumn } from './ConciergeKanbanColumn'
import { ViagemCard } from './ViagemCard'
import { ViagemAtendimentosDrawer } from './ViagemAtendimentosDrawer'

interface ConciergeViagensBoardProps {
  filters: KanbanViagensFilters
}

export function ConciergeViagensBoard({ filters }: ConciergeViagensBoardProps) {
  const { groupedBySaude, isLoading } = useKanbanViagens(filters)
  const [selected, setSelected] = useState<ViagemKanbanItem | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(containerRef, {
    enableDragToPan: true,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Carregando viagens…
      </div>
    )
  }

  return (
    <div className="relative h-full">
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-2 shadow-md hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-2 shadow-md hover:bg-slate-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <div ref={containerRef} className="flex gap-3 overflow-x-auto px-6 py-4 h-full scroll-smooth">
        {SAUDE_COLUMNS.map(col => {
          const items = groupedBySaude.get(col.id) ?? []
          return (
            <ConciergeKanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              hint={col.hint}
              count={items.length}
              tone={col.tone}
              emoji={col.emoji}
              droppable={false}
            >
              {items.length === 0 ? (
                <div className="text-[11px] text-slate-400 italic py-4 text-center">
                  nenhuma viagem
                </div>
              ) : (
                items.map(v => (
                  <ViagemCard key={v.card_id} viagem={v} onClick={() => setSelected(v)} />
                ))
              )}
            </ConciergeKanbanColumn>
          )
        })}
      </div>

      <ViagemAtendimentosDrawer viagem={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
