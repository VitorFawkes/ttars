import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Heart, Search, X } from 'lucide-react'
import { cn } from '../../../lib/utils'

const MAX_RESULTS = 12

interface WeddingOption {
  id: string
  titulo: string
}

interface WeddingPickerProps {
  weddings: WeddingOption[]
  /** ID do casamento selecionado, ou null quando nenhum. */
  selected: string | null
  onChange: (id: string | null) => void
  placeholder?: string
}

/** Picker single-select de casamento. Reusa o padrão visual do multi-select
 *  do FiltersBar mas com um único valor. */
export function WeddingPicker({ weddings, selected, onChange, placeholder = 'Escolha um casamento' }: WeddingPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedWedding = useMemo(
    () => (selected ? weddings.find(w => w.id === selected) ?? null : null),
    [weddings, selected],
  )

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return weddings.slice(0, MAX_RESULTS)
    return weddings.filter(w => w.titulo.toLowerCase().includes(term)).slice(0, MAX_RESULTS)
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md border bg-white hover:bg-slate-50 transition-colors',
          selectedWedding ? 'border-indigo-300 text-slate-900' : 'border-slate-200 text-slate-500',
        )}
      >
        <Heart className={cn('w-4 h-4 shrink-0', selectedWedding ? 'text-indigo-500' : 'text-rose-400')} />
        <span className="flex-1 truncate text-left">
          {selectedWedding ? selectedWedding.titulo : placeholder}
        </span>
        {selectedWedding && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="text-slate-400 hover:text-slate-700"
            title="Limpar seleção"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-full bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
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
                const active = selected === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { onChange(w.id); setOpen(false); setQuery('') }}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors flex items-center gap-2',
                      active && 'bg-indigo-50 text-indigo-700',
                    )}
                  >
                    <Heart className={cn('w-3 h-3 shrink-0', active ? 'text-indigo-600' : 'text-rose-400')} />
                    <span className="truncate flex-1">{w.titulo}</span>
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
  )
}
