import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StageOption } from './FunnelFilterPanel'

interface Props {
  label?: string
  stageOptions: StageOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  /** Texto quando muitas etapas selecionadas. */
  manyLabel?: (count: number) => string
}

/**
 * Seletor de etapas com suporte a múltiplas escolhas (soma).
 * 1 etapa → comportamento de select simples.
 * 2+ etapas → "Oportunidade + Proposta" ou "3 etapas".
 */
export default function StageMultiSelect({
  stageOptions,
  selectedIds,
  onChange,
  placeholder = 'Selecione etapa(s)…',
  manyLabel = (n) => `${n} etapas`,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const clear = () => onChange([])

  const summary = (() => {
    if (selectedIds.length === 0) return placeholder
    const names = selectedIds
      .map(id => stageOptions.find(s => s.id === id)?.nome)
      .filter(Boolean) as string[]
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} + ${names[1]}`
    if (names.length === 3) return `${names[0]} + 2`
    return manyLabel(names.length)
  })()

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-left flex items-center justify-between gap-2 hover:border-slate-300 focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 outline-none',
          selectedIds.length === 0 && 'text-slate-400'
        )}
      >
        <span className="truncate flex-1">{summary}</span>
        {selectedIds.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation()
              clear()
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                clear()
              }
            }}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
            title="Limpar seleção"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {selectedIds.length > 0 && (
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {selectedIds.length} selecionada{selectedIds.length > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={clear}
                className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
              >
                Limpar
              </button>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {stageOptions.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                Nenhuma etapa disponível
              </div>
            )}
            {stageOptions.map(s => {
              const checked = selectedIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                      checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                    )}
                  >
                    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="truncate text-slate-700 flex-1" title={s.nome}>
                    {s.nome}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
