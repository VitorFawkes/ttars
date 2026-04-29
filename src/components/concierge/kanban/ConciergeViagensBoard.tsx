import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plane } from 'lucide-react'
import { useHorizontalScroll } from '../../../hooks/useHorizontalScroll'
import { useKanbanViagens, SAUDE_COLUMNS, type KanbanViagensFilters, type ViagemKanbanItem } from '../../../hooks/concierge/useKanbanViagens'
import { ConciergeKanbanColumn } from './ConciergeKanbanColumn'
import { ViagemCard } from './ViagemCard'
import { ViagemAtendimentosDrawer } from './ViagemAtendimentosDrawer'

interface ConciergeViagensBoardProps {
  filters: KanbanViagensFilters
}

export function ConciergeViagensBoard({ filters }: ConciergeViagensBoardProps) {
  const { groupedBySaude, isLoading, data } = useKanbanViagens(filters)
  const [selected, setSelected] = useState<ViagemKanbanItem | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(containerRef, {
    enableDragToPan: true,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Carregando viagens…
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-6 py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <Plane className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">Nenhuma viagem com atendimentos</h3>
          <p className="text-sm text-slate-500 mt-1.5">As viagens aparecem aqui quando tiverem ações de concierge.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md hover:bg-slate-50 hover:shadow-lg transition-shadow"
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
        </button>
      )}
      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md hover:bg-slate-50 hover:shadow-lg transition-shadow"
          aria-label="Rolar para direita"
        >
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
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
                <div className="text-[10.5px] text-slate-400 italic py-6 text-center">
                  vazio
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
