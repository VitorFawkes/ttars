import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PickerOption {
  id: string
  label: string
  /** Se presente, clicar nessa opção expande em múltiplos IDs (ex: um time expande para membros). */
  expandTo?: string[]
  /** Badge pequeno ao lado do label (ex: "10" para mostrar número de membros do time). */
  badge?: string
  /** Considera marcado quando TODOS os expandTo estão em selectedIds (em vez do próprio id). */
  matchByExpand?: boolean
}

export interface PickerSection {
  label: string
  options: PickerOption[]
}

interface Props {
  label: string
  icon?: React.ReactNode
  /** Lista flat; alternativa a `sections`. */
  options?: PickerOption[]
  /** Lista agrupada em seções (ex: Times + Pessoas). */
  sections?: PickerSection[]
  selectedIds: string[]
  onToggle: (id: string, expandTo?: string[]) => void
  onClear: () => void
  placeholder?: string
  singularNoun: string
  pluralNoun: string
  emptyHint?: string
  maxWidth?: number
}

/**
 * Dropdown compacto com checkboxes para seleção múltipla. Fecha ao clicar fora.
 * Usado na barra de filtros do Funil para owners e tags.
 */
export default function MultiPickerPopover({
  label,
  icon,
  options,
  sections,
  selectedIds,
  onToggle,
  onClear,
  placeholder,
  singularNoun,
  pluralNoun,
  emptyHint,
  maxWidth = 320,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const allOptions = sections ? sections.flatMap(s => s.options) : options || []
  const totalCount = allOptions.length

  const filterFn = (o: PickerOption) =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())

  const filteredSections: PickerSection[] = sections
    ? sections.map(s => ({ ...s, options: s.options.filter(filterFn) })).filter(s => s.options.length > 0)
    : [{ label: '', options: allOptions.filter(filterFn) }]

  const isOptionChecked = (o: PickerOption): boolean => {
    if (o.matchByExpand && o.expandTo && o.expandTo.length > 0) {
      return o.expandTo.every(id => selectedIds.includes(id))
    }
    return selectedIds.includes(o.id)
  }

  const summary = (() => {
    if (selectedIds.length === 0) return placeholder ?? 'Todos'
    if (selectedIds.length === 1) {
      const found = allOptions.find(o => o.id === selectedIds[0])
      return found?.label ?? `1 ${singularNoun}`
    }
    return `${selectedIds.length} ${pluralNoun}`
  })()

  const active = selectedIds.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
          active
            ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        )}
      >
        {icon}
        <span className="uppercase tracking-wider text-[10px] opacity-75">{label}:</span>
        <span className="truncate max-w-[140px]">{summary}</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation()
              onClear()
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onClear()
              }
            }}
            className="text-violet-500 hover:text-violet-700 font-bold ml-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        )}
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          style={{ minWidth: maxWidth }}
        >
          {totalCount > 6 && (
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                autoFocus
                placeholder={`Buscar ${singularNoun}…`}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredSections.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                {emptyHint ?? `Nenhum ${singularNoun} encontrado.`}
              </div>
            )}
            {filteredSections.map((sec, sIdx) => (
              <div key={sec.label || `sec-${sIdx}`}>
                {sec.label && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/60">
                    {sec.label}
                  </div>
                )}
                {sec.options.map((o, oIdx) => {
                  const checked = isOptionChecked(o)
                  const isGroupToggle = oIdx === 0 && !!o.expandTo && o.expandTo.length > 0
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onToggle(o.id, o.expandTo)}
                      className={cn(
                        'flex items-center gap-2 w-full py-1.5 text-left text-xs hover:bg-slate-50',
                        isGroupToggle ? 'px-3 font-medium text-slate-700' : 'pl-7 pr-3 text-slate-600'
                      )}
                    >
                      <span
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                        )}
                      >
                        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate flex-1" title={o.label}>
                        {o.label}
                      </span>
                      {o.badge && (
                        <span
                          className={cn(
                            'text-[10px] tabular-nums shrink-0',
                            isGroupToggle ? 'font-semibold text-indigo-500' : 'font-medium text-slate-400'
                          )}
                        >
                          {o.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {selectedIds.length > 0 && (
            <div className="border-t border-slate-100 px-2 py-1.5 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  onClear()
                  setOpen(false)
                }}
                className="w-full text-center text-[11px] font-medium text-indigo-600 hover:text-indigo-800 py-0.5"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
