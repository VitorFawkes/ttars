import { useMemo, useRef, useState } from 'react'
import { Plus, AlertCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CATEGORY_STYLES,
  type AvailableVariable,
  type DetectedVariable,
  detectVariables,
  formatVariable,
  getAvailableVariables,
} from '@/lib/playbook/availableVariables'

interface Props {
  value: string
  onChange: (next: string) => void
  /** Slug do produto do agente (WEDDING, TRIPS...). Define quais variáveis ww_/tr_/etc aparecem no dropdown. */
  produto?: string | null
  /** Override completo das variáveis disponíveis (sobrescreve produto). */
  availableVariables?: AvailableVariable[]
  placeholder?: string
  rows?: number
  /** Quando true, esconde a barra "Variáveis detectadas" abaixo do textarea (útil em campos curtos). */
  hideDetectedBar?: boolean
  className?: string
  /** Helper text exibido abaixo do textarea. */
  helperText?: string
  /** Quando true, força tipografia mono (raro — só pra campos que armazenam código/template). */
  mono?: boolean
}

/**
 * Textarea com suporte a variáveis {curly} e <angle>:
 *
 *   - Toolbar superior com dropdown de variáveis disponíveis (categoria + busca)
 *   - Tipografia sans-serif legível (não monoespaçada)
 *   - Barra inferior mostra variáveis detectadas como chips coloridos
 *   - Variáveis desconhecidas viram chips vermelhos com warning
 *   - Inserção via dropdown coloca a variável na posição do cursor
 *
 * Substituto opinionado do <textarea> cru pra campos de prompt do agente.
 * Reusa o catálogo central de availableVariables.ts.
 */
export function VariableTextarea({
  value,
  onChange,
  produto,
  availableVariables,
  placeholder,
  rows = 4,
  hideDetectedBar = false,
  className,
  helperText,
  mono = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const available = useMemo<AvailableVariable[]>(
    () => availableVariables ?? getAvailableVariables(produto),
    [availableVariables, produto],
  )

  const detected = useMemo<DetectedVariable[]>(
    () => detectVariables(value, available),
    [value, available],
  )

  const unknownCount = detected.filter((d) => !d.known).length

  const insertVariable = (v: AvailableVariable) => {
    const ta = textareaRef.current
    const start = ta?.selectionStart ?? value.length
    const end = ta?.selectionEnd ?? value.length
    const token = formatVariable(v)
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    setDropdownOpen(false)
    setSearchTerm('')
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const pos = start + token.length
      ta.setSelectionRange(pos, pos)
    })
  }

  // Agrupa variáveis por categoria pro dropdown
  const grouped = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const filtered = term
      ? available.filter(
          (v) =>
            v.name.toLowerCase().includes(term) ||
            v.label.toLowerCase().includes(term) ||
            v.description?.toLowerCase().includes(term),
        )
      : available

    const byCat: Record<string, AvailableVariable[]> = {}
    for (const v of filtered) {
      if (!byCat[v.category]) byCat[v.category] = []
      byCat[v.category].push(v)
    }
    const order: AvailableVariable['category'][] = ['contact', 'card', 'agent', 'engine']
    return order
      .filter((c) => byCat[c]?.length > 0)
      .map((c) => ({ category: c, items: byCat[c] }))
  }, [available, searchTerm])

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              dropdownOpen
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Inserir variável
          </button>

          {dropdownOpen && (
            <>
              {/* Backdrop pra fechar ao clicar fora */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => {
                  setDropdownOpen(false)
                  setSearchTerm('')
                }}
              />
              <div className="absolute z-50 top-full left-0 mt-1 w-80 max-h-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                <div className="p-2 border-b border-slate-100">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar variável..."
                      className="w-full pl-7 pr-2 py-1 text-xs rounded border border-slate-200 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto max-h-72">
                  {grouped.length === 0 ? (
                    <div className="p-3 text-xs text-center text-slate-400">
                      Nenhuma variável encontrada.
                    </div>
                  ) : (
                    grouped.map((group) => {
                      const style = CATEGORY_STYLES[group.category]
                      return (
                        <div key={group.category}>
                          <div className="sticky top-0 bg-slate-50/95 backdrop-blur px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                            <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', style.dotBg)} />
                            {style.label}
                          </div>
                          {group.items.map((v) => (
                            <button
                              key={`${v.syntax}:${v.name}`}
                              type="button"
                              onClick={() => insertVariable(v)}
                              className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <code className={cn('text-[11px] px-1.5 py-0.5 rounded font-mono border', style.chipBg, style.chipText, style.chipBorder)}>
                                  {formatVariable(v)}
                                </code>
                                <span className="text-xs text-slate-700">{v.label}</span>
                              </div>
                              {v.description && (
                                <p className="text-[11px] text-slate-400 mt-0.5 ml-1">{v.description}</p>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {detected.length > 0 && !hideDetectedBar && (
          <div className="text-[11px] text-slate-400">
            {detected.length} {detected.length === 1 ? 'variável' : 'variáveis'} usadas
            {unknownCount > 0 && (
              <span className="ml-1 text-rose-600 font-medium">
                · {unknownCount} desconhecida{unknownCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Textarea principal */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y',
          mono && 'font-mono text-xs',
        )}
      />

      {/* Helper text */}
      {helperText && (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}

      {/* Barra de variáveis detectadas */}
      {!hideDetectedBar && detected.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center pt-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">
            Detectado:
          </span>
          {/* Dedup por raw — mostra cada variável única 1x */}
          {Array.from(new Map(detected.map((d) => [d.raw, d])).values()).map((d) => {
            if (!d.known) {
              return (
                <span
                  key={d.raw}
                  className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-mono border bg-rose-50 text-rose-700 border-rose-200"
                  title="Variável desconhecida — não vai ser substituída em runtime"
                >
                  <AlertCircle className="w-3 h-3" />
                  {d.raw}
                </span>
              )
            }
            const style = CATEGORY_STYLES[d.known.category]
            return (
              <span
                key={d.raw}
                className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded font-mono border',
                  style.chipBg,
                  style.chipText,
                  style.chipBorder,
                )}
                title={d.known.description || d.known.label}
              >
                {d.raw}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
