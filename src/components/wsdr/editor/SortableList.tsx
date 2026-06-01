import { type ReactNode } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

// Lista reordenável por ARRASTAR (o Vitor pediu — as setas ficaram ruins).
// Reusada em fases, momentos, slots de sondagem, critérios. O id é o índice (estável
// dentro de cada render); ao soltar, faz arrayMove e devolve a nova ordem.
export function SortableList<T>({
  items, onReorder, renderItem,
}: {
  items: T[]
  onReorder: (next: T[]) => void
  renderItem: (item: T, index: number) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )
  const ids = items.map((_, i) => String(i))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = Number(active.id)
    const to = Number(over.id)
    if (Number.isNaN(from) || Number.isNaN(to)) return
    onReorder(arrayMove(items, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((item, i) => (
            <SortableRow key={i} id={String(i)}>{renderItem(item, i)}</SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// Linha arrastável: alça (grip) à esquerda + o conteúdo do item à direita.
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-3 p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
        title="Arraste para reordenar"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
