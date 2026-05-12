import { useState, useRef, useMemo } from 'react'
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
import { ChevronLeft, ChevronRight, Loader2, Zap } from 'lucide-react'
import { useHorizontalScroll } from '../../../hooks/useHorizontalScroll'
import { useKanbanTarefas, ESTADO_FUNIL_COLUMNS, type EstadoFunil, type KanbanTarefaItem, type KanbanTarefasFilters } from '../../../hooks/concierge/useKanbanTarefas'
import { useMoverEstadoFunil } from '../../../hooks/concierge/useMoverEstadoFunil'
import { useReagendarConciergeAtendimento } from '../../../hooks/concierge/useReagendarConciergeAtendimento'
import { useExecutarEmLote } from '../../../hooks/concierge/useAtendimentoMutations'
import { ConciergeKanbanColumn } from './ConciergeKanbanColumn'
import { AtendimentoCard } from './AtendimentoCard'
import { EncerrarAtendimentoModal } from './EncerrarAtendimentoModal'
import { ReagendarConciergeDateModal, type ReagendarMode } from './ReagendarConciergeDateModal'
import { AtendimentoDetailModal } from '../AtendimentoDetailModal'
import { SelectionActionBar } from './SelectionActionBar'

interface ConciergeKanbanBoardProps {
  filters: KanbanTarefasFilters
}

export function ConciergeKanbanBoard({ filters }: ConciergeKanbanBoardProps) {
  const { groupedByEstado, isLoading, data, thresholdDays } = useKanbanTarefas(filters)
  const moverFunil = useMoverEstadoFunil()
  const reagendar = useReagendarConciergeAtendimento()
  const executarEmLote = useExecutarEmLote()

  const [activeItem, setActiveItem] = useState<KanbanTarefaItem | null>(null)
  const [selected, setSelected] = useState<KanbanTarefaItem | null>(null)
  const [pendingEncerrar, setPendingEncerrar] = useState<KanbanTarefaItem | null>(null)
  const [pendingBulkEncerrar, setPendingBulkEncerrar] = useState<KanbanTarefaItem[] | null>(null)
  const [pendingReagendar, setPendingReagendar] = useState<{ item: KanbanTarefaItem; mode: ReagendarMode } | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Colunas retraídas — "agendado_futuro" e "encerrado" começam fechadas por default
  // (estoque distante e recusados/cancelados raramente precisam de atenção, mas
  // continuam acessíveis com 1 clique).
  const [collapsedCols, setCollapsedCols] = useState<Set<EstadoFunil>>(new Set(['agendado_futuro', 'encerrado']))
  const toggleCol = (id: EstadoFunil) => {
    setCollapsedCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(containerRef, {
    enableDragToPan: false,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const selectedItems = useMemo(() => {
    if (!data) return [] as KanbanTarefaItem[]
    return data.filter(it => selectedIds.has(it.atendimento_id))
  }, [data, selectedIds])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

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

    // Indo para "Agendados para o futuro" — pede data distante
    if (destino === 'agendado_futuro') {
      setPendingReagendar({ item, mode: 'to_future' })
      return
    }

    // Saindo de "Agendados para o futuro" para qualquer coluna ativa — pede data próxima
    if (item.estado_funil === 'agendado_futuro') {
      setPendingReagendar({ item, mode: 'to_active' })
      return
    }

    if (destino === 'encerrado') {
      setPendingEncerrar(item)
      return
    }

    moverFunil.mutate({ atendimento: item, destino })
  }

  const onBulkFeito = () => {
    const ids = selectedItems.filter(i => !i.outcome).map(i => i.atendimento_id)
    if (ids.length === 0) return
    executarEmLote.mutate(
      { atendimento_ids: ids, outcome: 'feito' },
      { onSuccess: () => clearSelection() }
    )
  }

  // Bulk Aceito e Bulk Notificar foram removidos da SelectionActionBar.
  // Marcar como Aceito segue disponível pelo modal de detalhe.

  const onBulkEncerrar = () => {
    const items = selectedItems.filter(i => !i.outcome)
    if (items.length === 0) return
    setPendingBulkEncerrar(items)
  }

  const selectionMode = selectedIds.size > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Carregando atendimentos…
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="px-6 py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">Sem atendimentos na fila</h3>
          <p className="text-sm text-slate-500 mt-1.5">Quando algo aparecer pra fazer, vai cair aqui.</p>
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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          ref={containerRef}
          className="flex gap-3 overflow-x-auto px-6 py-4 h-full scroll-smooth"
        >
          {ESTADO_FUNIL_COLUMNS.map(col => {
            const items = groupedByEstado.get(col.id) ?? []
            const isCollapsed = collapsedCols.has(col.id)
            return (
              <ConciergeKanbanColumn
                key={col.id}
                id={col.id}
                label={col.label}
                hint={col.hint}
                count={items.length}
                tone={col.tone}
                collapsed={isCollapsed}
                onToggleCollapsed={() => toggleCol(col.id)}
              >
                {items.length === 0 ? (
                  <div className="text-[10.5px] text-slate-400 italic py-6 text-center">
                    vazio
                  </div>
                ) : (
                  items.map(item => (
                    <AtendimentoCard
                      key={item.atendimento_id}
                      item={item}
                      onClick={() => setSelected(item)}
                      selected={selectedIds.has(item.atendimento_id)}
                      onToggleSelect={() => toggleSelect(item.atendimento_id)}
                      selectionMode={selectionMode}
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

      <SelectionActionBar
        selected={selectedItems}
        onClear={clearSelection}
        onMarcarFeito={onBulkFeito}
        onEncerrar={onBulkEncerrar}
        isPending={executarEmLote.isPending}
      />

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

      <EncerrarAtendimentoModal
        open={!!pendingBulkEncerrar}
        onClose={() => setPendingBulkEncerrar(null)}
        isSubmitting={executarEmLote.isPending}
        onConfirm={(motivo, observacao) => {
          if (!pendingBulkEncerrar) return
          const ids = pendingBulkEncerrar.map(i => i.atendimento_id)
          executarEmLote.mutate(
            { atendimento_ids: ids, outcome: motivo, observacao },
            {
              onSuccess: () => { clearSelection(); setPendingBulkEncerrar(null) },
              onError: () => setPendingBulkEncerrar(null),
            }
          )
        }}
      />

      <ReagendarConciergeDateModal
        open={!!pendingReagendar}
        mode={pendingReagendar?.mode ?? 'to_active'}
        thresholdDays={thresholdDays}
        isSubmitting={reagendar.isPending}
        onClose={() => setPendingReagendar(null)}
        onConfirm={(novaDataIso) => {
          if (!pendingReagendar) return
          reagendar.mutate(
            { atendimento: pendingReagendar.item, nova_data: novaDataIso },
            { onSettled: () => setPendingReagendar(null) }
          )
        }}
      />
    </div>
  )
}
