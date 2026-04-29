import { useState, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useHorizontalScroll } from '../../../hooks/useHorizontalScroll'
import { useKanbanTarefas, ESTADO_FUNIL_COLUMNS, type EstadoFunil, type KanbanTarefaItem, type KanbanTarefasFilters } from '../../../hooks/concierge/useKanbanTarefas'
import { useMoverEstadoFunil } from '../../../hooks/concierge/useMoverEstadoFunil'
import { ConciergeKanbanColumn } from './ConciergeKanbanColumn'
import { AtendimentoCard } from './AtendimentoCard'
import { EncerrarAtendimentoModal } from './EncerrarAtendimentoModal'
import { AtendimentoDetailModal } from '../AtendimentoDetailModal'
import { toast } from 'sonner'
import { cn } from '../../../lib/utils'

interface ConciergeKanbanBoardProps {
  filters: KanbanTarefasFilters
}

export function ConciergeKanbanBoard({ filters }: ConciergeKanbanBoardProps) {
  const { groupedByEstado, isLoading } = useKanbanTarefas(filters)
  const moverFunil = useMoverEstadoFunil()
  const [activeItem, setActiveItem] = useState<KanbanTarefaItem | null>(null)
  const [selected, setSelected] = useState<KanbanTarefaItem | null>(null)
  const [pendingEncerrar, setPendingEncerrar] = useState<KanbanTarefaItem | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(containerRef, {
    enableDragToPan: false,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as KanbanTarefaItem | undefined
    if (item) setActiveItem(item)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null)
    const item = event.active.data.current?.item as KanbanTarefaItem | undefined
    const destino = event.over?.id as EstadoFunil | undefined
    if (!item || !destino) return
    if (item.estado_funil === destino) return

    if (destino === 'a_fazer') {
      toast.error('Não dá pra voltar para "A fazer"')
      return
    }

    if (destino === 'aceito' && item.tipo_concierge !== 'oferta') {
      toast.error('Só ofertas podem ser marcadas como aceitas')
      return
    }

    if (destino === 'encerrado') {
      setPendingEncerrar(item)
      return
    }

    moverFunil.mutate({ atendimento: item, destino })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Carregando atendimentos…
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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          ref={containerRef}
          className={cn('flex gap-3 overflow-x-auto px-6 py-4 h-full', 'scroll-smooth')}
        >
          {ESTADO_FUNIL_COLUMNS.map(col => {
            const items = groupedByEstado.get(col.id) ?? []
            return (
              <ConciergeKanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                hint={col.hint}
                count={items.length}
                tone={col.tone}
              >
                {items.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic py-4 text-center">
                    nenhum atendimento
                  </div>
                ) : (
                  items.map(item => (
                    <AtendimentoCard
                      key={item.atendimento_id}
                      item={item}
                      onClick={() => setSelected(item)}
                    />
                  ))
                )}
              </ConciergeKanbanColumn>
            )
          })}
        </div>

        <DragOverlay>
          {activeItem && <AtendimentoCard item={activeItem} onClick={() => {}} isOverlay />}
        </DragOverlay>
      </DndContext>

      <AtendimentoDetailModal
        item={selected ?? undefined}
        open={!!selected}
        onClose={() => setSelected(null)}
      />

      <EncerrarAtendimentoModal
        open={!!pendingEncerrar}
        onClose={() => setPendingEncerrar(null)}
        isSubmitting={moverFunil.isPending}
        onConfirm={(motivo, observacao) => {
          if (!pendingEncerrar) return
          moverFunil.mutate(
            { atendimento: pendingEncerrar, destino: 'encerrado', outcomeEncerramento: motivo, observacao },
            { onSettled: () => setPendingEncerrar(null) }
          )
        }}
      />
    </div>
  )
}
