import { useMemo, useRef, useState, useEffect } from 'react'
import { Search, X, ChevronDown, Heart } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useConvidadosPreferences } from '../../../hooks/convidados/useConvidadosPreferences'
import { useWeddings } from '../../../hooks/convidados/useWeddings'
import { STATUS_RSVP_LABEL, STATUS_RSVP_LIST, type StatusRSVP } from '../../../hooks/convidados/types'

const STATUS_STYLE: Record<StatusRSVP, { active: string; inactive: string }> = {
  nao_vai: { active: 'bg-rose-600 text-white border-rose-600', inactive: 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50' },
  sem_reacao: { active: 'bg-slate-700 text-white border-slate-700', inactive: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' },
  intencao: { active: 'bg-sky-600 text-white border-sky-600', inactive: 'bg-white text-sky-700 border-sky-200 hover:bg-sky-50' },
  confirmado: { active: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
}

const MAX_RESULTS = 12

export function FiltersBar() {
  const { prefs, setPref, toggleStatus, toggleWedding, clearAll, hasAnyFilter } = useConvidadosPreferences()
  const { data: weddings = [], isSuccess: weddingsLoaded } = useWeddings()

  // Sanitiza weddingFilter: se houver UUIDs persistidos que não existem mais
  // (casamento deletado, ou cliente trocou de org), remove. Sem isso a query
  // de convidados aplica `.in('card_id', [id_inexistente])` e devolve 0.
  useEffect(() => {
    if (!weddingsLoaded || prefs.weddingFilter.length === 0) return
    const validIds = new Set(weddings.map(w => w.id))
    const cleaned = prefs.weddingFilter.filter(id => validIds.has(id))
    if (cleaned.length !== prefs.weddingFilter.length) {
      setPref('weddingFilter', cleaned)
    }
  }, [weddingsLoaded, weddings, prefs.weddingFilter, setPref])

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={prefs.search}
            onChange={e => setPref('search', e.target.value)}
            placeholder="Buscar por nome, email ou telefone"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </div>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 mr-1">RSVP:</span>
        {STATUS_RSVP_LIST.map(status => {
          const active = prefs.statusFilter.includes(status)
          const style = STATUS_STYLE[status]
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                active ? style.active : style.inactive,
              )}
            >
              {STATUS_RSVP_LABEL[status]}
            </button>
          )
        })}
      </div>

      {weddings.length > 1 && (
        <WeddingPicker
          weddings={weddings}
          selected={prefs.weddingFilter}
          onToggle={toggleWedding}
        />
      )}
    </div>
  )
}

interface WeddingPickerProps {
  weddings: { id: string; titulo: string }[]
  selected: string[]
  onToggle: (id: string) => void
}

function WeddingPicker({ weddings, selected, onToggle }: WeddingPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedWeddings = useMemo(
    () => selected.map(id => weddings.find(w => w.id === id)).filter((w): w is { id: string; titulo: string } => !!w),
    [weddings, selected],
  )

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return weddings.slice(0, MAX_RESULTS)
    return weddings
      .filter(w => w.titulo.toLowerCase().includes(term))
      .slice(0, MAX_RESULTS)
  }, [weddings, query])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 mr-1">Casamento:</span>

        {selectedWeddings.map(w => (
          <button
            key={w.id}
            type="button"
            onClick={() => onToggle(w.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-600 text-white border border-indigo-600 max-w-[220px]"
            title={w.titulo}
          >
            <span className="truncate">{w.titulo}</span>
            <X className="w-3 h-3 shrink-0" />
          </button>
        ))}

        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Search className="w-3 h-3" />
            {selectedWeddings.length > 0 ? 'Adicionar' : 'Buscar casamento'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1 z-10 w-72 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Digite o nome do casamento"
                    autoFocus
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {results.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">
                    Nenhum casamento encontrado.
                  </div>
                ) : (
                  results.map(w => {
                    const active = selected.includes(w.id)
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onToggle(w.id)}
                        className={cn(
                          'w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors flex items-center gap-2',
                          active && 'bg-indigo-50 text-indigo-700',
                        )}
                      >
                        <Heart className={cn('w-3 h-3 shrink-0', active ? 'text-indigo-600' : 'text-rose-400')} />
                        <span className="truncate flex-1">{w.titulo}</span>
                        {active && <X className="w-3 h-3 shrink-0 text-indigo-500" />}
                      </button>
                    )
                  })
                )}
                {!query && weddings.length > MAX_RESULTS && (
                  <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
                    Mostrando {MAX_RESULTS} de {weddings.length}. Digite para filtrar.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
