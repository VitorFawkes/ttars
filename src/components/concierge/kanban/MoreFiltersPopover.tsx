import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, Search, X, Check } from 'lucide-react'
import { CATEGORIAS_CONCIERGE } from '../../../hooks/concierge/types'
import { useFilterTags, type FilterTag } from '../../../hooks/analytics/useFilterOptions'
import type { KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'
import { cn } from '../../../lib/utils'

interface CardOption {
  id: string
  titulo: string
  produto: string | null
  abertos: number
}

interface MoreFiltersPopoverProps {
  categoriasFilter: string[]
  onToggleCategoria: (key: string) => void
  tagFilter: string[]
  onToggleTag: (id: string) => void
  cardFilter: { id: string; titulo: string } | null
  onSelectCard: (card: { id: string; titulo: string } | null) => void
  /** Lista atual de tarefas (pra derivar opções de card e categoria presentes) */
  tarefas: KanbanTarefaItem[]
}

export function MoreFiltersPopover({
  categoriasFilter,
  onToggleCategoria,
  tagFilter,
  onToggleTag,
  cardFilter,
  onSelectCard,
  tarefas,
}: MoreFiltersPopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [cardSearch, setCardSearch] = useState('')

  const { data: allTags = [] } = useFilterTags()

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const categoriasPresentes = useMemo(() => {
    const set = new Set<string>()
    for (const t of tarefas) set.add(t.categoria)
    return Array.from(set).sort()
  }, [tarefas])

  const cardsPresentes = useMemo<CardOption[]>(() => {
    const map = new Map<string, CardOption>()
    for (const t of tarefas) {
      const ex = map.get(t.card_id)
      if (ex) {
        ex.abertos += (!t.outcome && !t.concluida ? 1 : 0)
      } else {
        map.set(t.card_id, {
          id: t.card_id,
          titulo: t.card_titulo,
          produto: t.produto,
          abertos: !t.outcome && !t.concluida ? 1 : 0,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.abertos - a.abertos)
  }, [tarefas])

  const cardsFiltrados = cardSearch.trim()
    ? cardsPresentes.filter(c => c.titulo.toLowerCase().includes(cardSearch.toLowerCase()))
    : cardsPresentes

  const totalActive = categoriasFilter.length + tagFilter.length + (cardFilter ? 1 : 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded-md border transition-colors',
          totalActive > 0
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        )}
      >
        <Filter className="w-3 h-3" />
        Mais filtros
        {totalActive > 0 && (
          <span className="font-mono text-[10px] bg-indigo-600 text-white px-1.5 rounded-full">{totalActive}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-[420px] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-[480px] overflow-y-auto">
            <Section title="Viagem específica">
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar viagem nessa lista…"
                  value={cardSearch}
                  onChange={(e) => setCardSearch(e.target.value)}
                  className="w-full h-7 pl-7 pr-2 text-[12px] bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                />
              </div>
              {cardFilter && (
                <button
                  type="button"
                  onClick={() => onSelectCard(null)}
                  className="mb-2 inline-flex items-center gap-1 text-[11.5px] text-indigo-700 hover:text-indigo-900"
                >
                  <X className="w-3 h-3" />
                  Limpar viagem selecionada
                </button>
              )}
              <div className="max-h-40 overflow-y-auto -mx-3 px-3">
                {cardsFiltrados.length === 0 && (
                  <div className="text-[11.5px] text-slate-400 italic py-2">Nenhuma viagem na fila</div>
                )}
                {cardsFiltrados.map(c => {
                  const isSelected = cardFilter?.id === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectCard(isSelected ? null : { id: c.id, titulo: c.titulo })}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-2 py-1.5 text-[12px] text-left rounded transition-colors',
                        isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{c.titulo}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">{c.produto?.toUpperCase()} · {c.abertos} aberto{c.abertos === 1 ? '' : 's'}</div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Categoria">
              {categoriasPresentes.length === 0 && (
                <div className="text-[11.5px] text-slate-400 italic">Sem categorias na fila</div>
              )}
              <div className="flex flex-wrap gap-1">
                {categoriasPresentes.map(key => {
                  const cat = CATEGORIAS_CONCIERGE[key as keyof typeof CATEGORIAS_CONCIERGE]
                  const label = cat?.label ?? key
                  const active = categoriasFilter.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleCategoria(key)}
                      className={cn(
                        'inline-flex items-center h-6 px-2 rounded text-[11px] font-medium border transition-colors',
                        active
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="Tag do card">
              {allTags.length === 0 && (
                <div className="text-[11.5px] text-slate-400 italic">Nenhuma tag configurada no workspace</div>
              )}
              <div className="flex flex-wrap gap-1">
                {allTags.map((t: FilterTag) => {
                  const active = tagFilter.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onToggleTag(t.id)}
                      className={cn(
                        'inline-flex items-center h-6 px-2 rounded text-[11px] font-medium border transition-colors',
                        active
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-slate-100 last:border-b-0">
      <div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">{title}</div>
      {children}
    </div>
  )
}
