import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from 'lucide-react'
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'
import { usePlanejamentoWeddings, type WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useUpdatePlanejamentoEtapa } from '../../hooks/planejamento/useUpdatePlanejamentoEtapa'
import {
  PLANEJAMENTO_LABEL,
  PLANEJAMENTO_ORDER,
  isEtapaPlanejamento,
  type EtapaPlanejamento,
} from '../../hooks/planejamento/types'
import { PlanejamentoColumn, type ColumnTone } from './PlanejamentoColumn'
import { PlanejamentoCard } from './PlanejamentoCard'

const COLUMN_TONE: Record<EtapaPlanejamento, ColumnTone> = {
  boas_vindas: { accent: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  onboarding: { accent: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  propostas: { accent: 'bg-violet-400', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  definicao: { accent: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  passagem: { accent: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  aditivo: { accent: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export function PlanejamentoBoard() {
  const { data, isLoading } = usePlanejamentoWeddings()
  const update = useUpdatePlanejamentoEtapa()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [activeWedding, setActiveWedding] = useState<WeddingPlanejamento | null>(null)
  const [collapsedCols, setCollapsedCols] = useState<Set<EtapaPlanejamento>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const { showLeftArrow, showRightArrow, scrollLeft, scrollRight } = useHorizontalScroll(
    containerRef,
    { enableDragToPan: false },
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data
    return data.filter((w) =>
      w.titulo.toLowerCase().includes(term) ||
      (w.local ?? '').toLowerCase().includes(term),
    )
  }, [data, search])

  const grouped = useMemo(() => {
    const map = new Map<EtapaPlanejamento, WeddingPlanejamento[]>()
    for (const col of PLANEJAMENTO_ORDER) map.set(col, [])
    for (const w of filtered) map.get(w.planejamentoEtapa)?.push(w)
    return map
  }, [filtered])

  const toggleCol = (id: EtapaPlanejamento) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDragStart = (e: DragStartEvent) => {
    const item = e.active.data.current?.wedding as WeddingPlanejamento | undefined
    if (item) setActiveWedding(item)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveWedding(null)
    const item = e.active.data.current?.wedding as WeddingPlanejamento | undefined
    const destino = e.over?.id
    if (!item || !isEtapaPlanejamento(destino)) return
    if (item.planejamentoEtapa === destino) return
    update.mutate({ cardId: item.id, etapa: destino })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Carregando casamentos…
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-900">Nenhum casamento em planejamento</h3>
        <p className="text-sm text-slate-500 mt-1.5">
          Assim que um casamento fecha contrato (ganha no Closer), ele aparece aqui para você acompanhar o planejamento.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-180px)] min-h-[480px]">
      {/* Barra de filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar casamento…"
            className="h-8 w-56 pl-8 pr-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <span className="text-xs text-slate-500">
          {filtered.length} {filtered.length === 1 ? 'casamento' : 'casamentos'}
        </span>
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
            {PLANEJAMENTO_ORDER.map((status) => {
              const items = grouped.get(status) ?? []
              return (
                <PlanejamentoColumn
                  key={status}
                  id={status}
                  label={PLANEJAMENTO_LABEL[status]}
                  count={items.length}
                  tone={COLUMN_TONE[status]}
                  collapsed={collapsedCols.has(status)}
                  onToggleCollapsed={() => toggleCol(status)}
                >
                  {items.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic text-center py-6">
                      Sem casamentos aqui.
                    </p>
                  ) : (
                    items.map((w) => (
                      <PlanejamentoCard
                        key={w.id}
                        wedding={w}
                        onClick={() => navigate(`/planejamento/casamento/${w.id}`)}
                      />
                    ))
                  )}
                </PlanejamentoColumn>
              )
            })}
          </div>

          <DragOverlay>
            {activeWedding && (
              <div className="opacity-95 rotate-1 cursor-grabbing w-[280px]">
                <PlanejamentoCard wedding={activeWedding} isOverlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
