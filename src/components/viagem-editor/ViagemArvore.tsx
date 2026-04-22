import { useMemo } from 'react'
import {
  Hotel, Plane, Car, MapPin, UtensilsCrossed, ShieldCheck, Lightbulb,
  FileText, Contact, CheckSquare, Ticket, Plus, Trash2, GripVertical,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/Button'
import type { TripItemTipo, TripItemStatus } from '@/types/viagem'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useReorderTripItems } from '@/hooks/viagem/useViagemInterna'

const TIPO_ICON: Record<TripItemTipo, typeof Hotel> = {
  dia: MapPin,
  hotel: Hotel,
  voo: Plane,
  transfer: Car,
  passeio: MapPin,
  refeicao: UtensilsCrossed,
  seguro: ShieldCheck,
  dica: Lightbulb,
  voucher: Ticket,
  contato: Contact,
  texto: FileText,
  checklist: CheckSquare,
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-slate-100 text-slate-600' },
  proposal: { label: 'Proposta', color: 'bg-blue-100 text-blue-700' },
  financeiro: { label: 'Produto-Vendas', color: 'bg-emerald-100 text-emerald-700' },
  library: { label: 'Biblioteca', color: 'bg-violet-100 text-violet-700' },
}

const STATUS_DOT: Record<TripItemStatus, string> = {
  rascunho: 'bg-slate-300',
  proposto: 'bg-blue-500',
  aprovado: 'bg-emerald-500',
  recusado: 'bg-red-500',
  operacional: 'bg-violet-500',
  vivido: 'bg-amber-500',
  arquivado: 'bg-slate-400',
}

interface Props {
  items: TripItemInterno[]
  selectedId: string | null
  onSelect: (itemId: string) => void
  onAddDay: () => void
  onAddItem: (parentId: string | null) => void
  onDelete: (itemId: string) => void
}

export function ViagemArvore({ items, selectedId, onSelect, onAddDay, onAddItem, onDelete }: Props) {
  const reorder = useReorderTripItems()

  const { dias, orfaos, filhosPorDia } = useMemo(() => {
    const dias = items.filter((i) => i.tipo === 'dia').sort((a, b) => a.ordem - b.ordem)
    const naoDias = items.filter((i) => i.tipo !== 'dia')
    const parentIds = new Set(dias.map((d) => d.id))
    const orfaos = naoDias
      .filter((i) => !i.parent_id || !parentIds.has(i.parent_id))
      .sort((a, b) => a.ordem - b.ordem)
    const filhosPorDia = new Map<string, TripItemInterno[]>()
    for (const d of dias) {
      filhosPorDia.set(
        d.id,
        naoDias.filter((i) => i.parent_id === d.id).sort((a, b) => a.ordem - b.ordem),
      )
    }
    return { dias, orfaos, filhosPorDia }
  }, [items])

  const viagemId = items[0]?.viagem_id ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent, scope: 'dias' | 'orfaos' | string) => {
    const { active, over } = event
    if (!over || active.id === over.id || !viagemId) return

    let lista: TripItemInterno[]
    if (scope === 'dias') lista = dias
    else if (scope === 'orfaos') lista = orfaos
    else lista = filhosPorDia.get(scope) ?? []

    const oldIndex = lista.findIndex((i) => i.id === active.id)
    const newIndex = lista.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(lista, oldIndex, newIndex)
    reorder.mutate({
      viagem_id: viagemId,
      updates: reordered.map((item, idx) => ({ id: item.id, ordem: idx })),
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estrutura</h2>
        <Button size="sm" variant="outline" onClick={onAddDay} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Dia
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {orfaos.length > 0 && (
          <div className="mb-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, 'orfaos')}
            >
              <SortableContext items={orfaos.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {orfaos.map((i) => (
                  <SortableRow
                    key={i.id}
                    item={i}
                    selected={selectedId === i.id}
                    dentroDia={false}
                    onSelect={() => onSelect(i.id)}
                    onDelete={() => onDelete(i.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={() => onAddItem(null)}
              className="ml-0 mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <Plus className="h-3 w-3" />
              Adicionar item avulso
            </button>
          </div>
        )}

        {dias.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => handleDragEnd(e, 'dias')}
          >
            <SortableContext items={dias.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {dias.map((dia) => {
                const filhos = filhosPorDia.get(dia.id) ?? []
                return (
                  <div key={dia.id} className="mb-3">
                    <SortableRow
                      item={dia}
                      selected={selectedId === dia.id}
                      dentroDia={false}
                      onSelect={() => onSelect(dia.id)}
                      onDelete={() => onDelete(dia.id)}
                    />
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(e, dia.id)}
                    >
                      <SortableContext
                        items={filhos.map((f) => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {filhos.map((f) => (
                          <SortableRow
                            key={f.id}
                            item={f}
                            selected={selectedId === f.id}
                            dentroDia
                            onSelect={() => onSelect(f.id)}
                            onDelete={() => onDelete(f.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                    <button
                      type="button"
                      onClick={() => onAddItem(dia.id)}
                      className="ml-5 mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar item
                    </button>
                  </div>
                )
              })}
            </SortableContext>
          </DndContext>
        )}

        {dias.length === 0 && orfaos.length === 0 && (
          <div className="mt-6 text-center text-xs text-slate-500">
            <p>Nenhum item ainda.</p>
            <p className="mt-1">Clique em <span className="font-medium">+ Dia</span> ou adicione um item avulso.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SortableRow({
  item,
  selected,
  dentroDia,
  onSelect,
  onDelete,
}: {
  item: TripItemInterno
  selected: boolean
  dentroDia: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Icon = TIPO_ICON[item.tipo] ?? FileText
  const sourceBadge = item.source_type ? SOURCE_BADGE[item.source_type] : null
  const dot = STATUS_DOT[item.status] ?? 'bg-slate-300'

  const c = item.comercial as { titulo?: string; descricao?: string }
  const titulo = c.titulo || c.descricao || `Item ${item.tipo}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
        selected ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50 text-slate-700'
      } ${dentroDia ? 'ml-5' : ''} ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
        title={`Status: ${item.status}`}
      />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="truncate">{titulo}</span>
        {sourceBadge && (
          <span className={`ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sourceBadge.color}`}>
            {sourceBadge.label}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        aria-label="Apagar"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
