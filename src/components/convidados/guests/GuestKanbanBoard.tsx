import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '../../../lib/utils'
import { useUpdateGuestStatus } from '../../../hooks/convidados/useUpdateGuestStatus'
import { STATUS_RSVP_LABEL, type Guest, type StatusRSVP } from '../../../hooks/convidados/types'
import { GuestKanbanCard } from './GuestKanbanCard'

// Ordem das colunas: do mais "neutro" para os definitivos (positivo e negativo).
const COLUMN_ORDER: StatusRSVP[] = ['sem_reacao', 'intencao', 'confirmado', 'nao_vai']

const COLUMN_TONE: Record<StatusRSVP, { accent: string; chip: string }> = {
  sem_reacao: {
    accent: 'bg-slate-300',
    chip: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  intencao: {
    accent: 'bg-sky-400',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  confirmado: {
    accent: 'bg-emerald-400',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  nao_vai: {
    accent: 'bg-rose-400',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
  },
}

function isStatusRSVP(value: unknown): value is StatusRSVP {
  return value === 'sem_reacao' || value === 'intencao' || value === 'confirmado' || value === 'nao_vai'
}

interface GuestKanbanBoardProps {
  guests: Guest[]
  search: string
}

function GuestKanbanBoardBase({ guests, search }: GuestKanbanBoardProps) {
  const updateStatus = useUpdateGuestStatus()
  const [activeGuest, setActiveGuest] = useState<Guest | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return guests
    return guests.filter(g => {
      const full = `${g.nome} ${g.sobrenome ?? ''}`.toLowerCase()
      return (
        full.includes(term) ||
        (g.email ?? '').toLowerCase().includes(term) ||
        (g.telefone ?? '').toLowerCase().includes(term)
      )
    })
  }, [guests, search])

  const grouped = useMemo(() => {
    const map: Record<StatusRSVP, Guest[]> = {
      sem_reacao: [],
      intencao: [],
      confirmado: [],
      nao_vai: [],
    }
    for (const g of filtered) {
      if (map[g.status_rsvp]) map[g.status_rsvp].push(g)
    }
    return map
  }, [filtered])

  const handleDragStart = (e: DragStartEvent) => {
    const item = e.active.data.current?.guest as Guest | undefined
    if (item) setActiveGuest(item)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveGuest(null)
    const item = e.active.data.current?.guest as Guest | undefined
    const destino = e.over?.id
    if (!item || !destino || !isStatusRSVP(destino)) return
    if (item.status_rsvp === destino) return
    updateStatus.mutate({ id: item.id, status_rsvp: destino })
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 items-stretch h-full min-h-0">
        {COLUMN_ORDER.map(status => (
          <Column
            key={status}
            status={status}
            guests={grouped[status]}
            tone={COLUMN_TONE[status]}
          />
        ))}
      </div>

      <DragOverlay>
        {activeGuest && (
          <div className="opacity-95 rotate-1 cursor-grabbing w-[280px]">
            <GuestKanbanCard guest={activeGuest} isOverlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// memo: evita re-render do board (e recriar milhares de elementos de card)
// quando só o pai muda — ex.: o indicador de loading do ConvidadosBoard liga/
// desliga. `guests` e `search` chegam estáveis, então a comparação rasa basta.
export const GuestKanbanBoard = memo(GuestKanbanBoardBase)

interface ColumnProps {
  status: StatusRSVP
  guests: Guest[]
  tone: { accent: string; chip: string }
}

// memo: durante o drag, o board re-renderiza (activeGuest muda). Sem memo cada
// coluna recriaria seus milhares de cards a cada frame do arraste.
const Column = memo(function Column({ status, guests, tone }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // A área de drop é, ao mesmo tempo, o alvo do dnd-kit e o container de scroll
  // do virtualizador — então combinamos os dois refs no mesmo nó.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      setNodeRef(node)
    },
    [setNodeRef],
  )

  // Virtualização: só os cards visíveis (+ overscan) são montados. Cada card é
  // um draggable do dnd-kit; montar milhares de uma vez travava a aba. O drop
  // continua sendo na COLUNA inteira (useDroppable acima), não por card, então
  // arrastar/soltar segue funcionando mesmo com cards fora da viewport.
  // Altura medida de verdade (measureElement) porque o card varia conforme tem
  // telefone/e-mail/casamento; getItemKey amarra a medição à identidade do
  // convidado pra não embaralhar alturas ao filtrar.
  const virtualizer = useVirtualizer({
    count: guests.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: index => guests[index].id,
  })

  return (
    <div className="flex flex-col flex-1 min-w-[280px] min-h-0">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header da coluna não encolhe */}
        <div className="relative px-3 py-2.5 border-b border-slate-100 bg-white shrink-0">
          <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', tone.accent)} />
          <div className="flex items-center justify-between gap-2 pl-2">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {STATUS_RSVP_LABEL[status]}
            </div>
            <span
              className={cn(
                'font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold tabular-nums border',
                tone.chip,
              )}
            >
              {guests.length}
            </span>
          </div>
        </div>
        {/* Drop area scrollável + virtualizada */}
        <div
          ref={setRefs}
          className={cn(
            'flex-1 min-h-0 px-2 py-2 bg-slate-50/40 overflow-y-auto transition-colors',
            isOver && 'bg-indigo-50/60 ring-2 ring-indigo-400 ring-inset',
          )}
        >
          {guests.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic text-center py-6">Sem convidados aqui.</p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map(vi => {
                const guest = guests[vi.index]
                return (
                  <div
                    key={guest.id}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="pb-2"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <GuestKanbanCard guest={guest} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
