import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Loader2, Search, Sparkles } from 'lucide-react'
import { useHorizontalScroll } from '../../../hooks/useHorizontalScroll'
import { useGuestExtras } from '../../../hooks/convidados/useGuestExtras'
import { useUpsertGuestExtras } from '../../../hooks/convidados/useUpsertGuestExtras'
import {
  EXTRA_STATUS_LABEL,
  EXTRA_STATUS_ORDER,
  type ExtraStatus,
  type GuestExtra,
} from '../../../hooks/convidados/types'
import { ExtrasKanbanColumn, type ColumnTone } from './ExtrasKanbanColumn'
import { ExtrasKanbanCard } from './ExtrasKanbanCard'
import { ExtrasDetailSheet } from './ExtrasDetailSheet'

const COLUMN_TONE: Record<ExtraStatus, ColumnTone> = {
  oferecido: { accent: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  interessado: { accent: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  confirmado: { accent: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pago: { accent: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}

function isExtraStatus(value: unknown): value is ExtraStatus {
  return (
    value === 'oferecido' ||
    value === 'interessado' ||
    value === 'confirmado' ||
    value === 'pago'
  )
}

export function ExtrasKanbanBoard() {
  const { data, isLoading } = useGuestExtras(null)
  const upsert = useUpsertGuestExtras()

  const [search, setSearch] = useState('')
  const [weddingFilter, setWeddingFilter] = useState<string>('all')
  const [activeGuest, setActiveGuest] = useState<GuestExtra | null>(null)
  const [selected, setSelected] = useState<GuestExtra | null>(null)
  const [collapsedCols, setCollapsedCols] = useState<Set<ExtraStatus>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(
    containerRef,
    { enableDragToPan: false },
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Lista de casamentos pro dropdown (distintos, a partir dos confirmados).
  const weddingOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of data) {
      if (g.card_id) map.set(g.card_id, g.casamento_nome ?? '(sem casamento)')
    }
    return [...map.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
  }, [data])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.filter((g) => {
      if (weddingFilter !== 'all' && g.card_id !== weddingFilter) return false
      if (!term) return true
      const full = `${g.nome} ${g.sobrenome ?? ''}`.toLowerCase()
      return (
        full.includes(term) ||
        (g.email ?? '').toLowerCase().includes(term) ||
        (g.telefone ?? '').toLowerCase().includes(term)
      )
    })
  }, [data, search, weddingFilter])

  const grouped = useMemo(() => {
    const map = new Map<ExtraStatus, GuestExtra[]>()
    for (const col of EXTRA_STATUS_ORDER) map.set(col, [])
    for (const g of filtered) map.get(g.extras_status)?.push(g)
    return map
  }, [filtered])

  const toggleCol = (id: ExtraStatus) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = (e: DragStartEvent) => {
    const item = e.active.data.current?.guest as GuestExtra | undefined
    if (item) setActiveGuest(item)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveGuest(null)
    const item = e.active.data.current?.guest as GuestExtra | undefined
    const destino = e.over?.id
    if (!item || !isExtraStatus(destino)) return
    if (item.extras_status === destino) return
    upsert.mutate({ guest_id: item.guest_id, status: destino, fromDrag: true })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Carregando convidados confirmados…
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
        <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-900">Nenhum convidado confirmado ainda</h3>
        <p className="text-sm text-slate-500 mt-1.5">
          Assim que um convidado confirmar presença, ele aparece aqui para você oferecer extras.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-220px)] min-h-[480px]">
      {/* Aviso de feature em construção */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11.5px] text-amber-800">
        <span className="px-1 h-4 inline-flex items-center rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-300">
          WIP
        </span>
        Fluxo de extras em construção — pode mudar.
      </div>

      {/* Barra de filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar convidado…"
            className="h-8 w-56 pl-8 pr-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          value={weddingFilter}
          onChange={(e) => setWeddingFilter(e.target.value)}
          className="h-8 px-2.5 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="all">Todos os casamentos</option>
          {weddingOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Kanban */}
      <div className="relative flex-1 min-h-0">
        {showLeftArrow && (
          <button
            onClick={scrollLeft}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md hover:bg-slate-50"
            aria-label="Rolar para esquerda"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
          </button>
        )}
        {showRightArrow && (
          <button
            onClick={scrollRight}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md hover:bg-slate-50"
            aria-label="Rolar para direita"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          </button>
        )}

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div ref={containerRef} className="flex gap-3 items-stretch h-full min-h-0 overflow-x-auto">
            {EXTRA_STATUS_ORDER.map((status) => {
              const items = grouped.get(status) ?? []
              return (
                <ExtrasKanbanColumn
                  key={status}
                  id={status}
                  label={EXTRA_STATUS_LABEL[status]}
                  count={items.length}
                  tone={COLUMN_TONE[status]}
                  collapsed={collapsedCols.has(status)}
                  onToggleCollapsed={() => toggleCol(status)}
                >
                  {items.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic text-center py-6">
                      Sem convidados aqui.
                    </p>
                  ) : (
                    items.map((g) => (
                      <ExtrasKanbanCard
                        key={g.guest_id}
                        guest={g}
                        onClick={() => setSelected(g)}
                      />
                    ))
                  )}
                </ExtrasKanbanColumn>
              )
            })}
          </div>

          <DragOverlay>
            {activeGuest && (
              <div className="opacity-95 rotate-1 cursor-grabbing w-[280px]">
                <ExtrasKanbanCard guest={activeGuest} isOverlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <ExtrasDetailSheet
        guest={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
