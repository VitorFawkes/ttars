import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { useCRMFields, type FieldScope, type CRMField } from './CRMFieldPicker'

export interface FieldAwareTextareaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  pipelineId?: string
  produto?: string
  scope?: FieldScope
  className?: string
  /** Caractere que dispara o autocomplete (default '@'). */
  trigger?: string
}

/**
 * Textarea com autocomplete de campos do CRM.
 * Ao digitar `@` no textarea, abre uma lista filtrável logo abaixo, navegável
 * por setas/Enter/Esc. Ao selecionar, a `key` do campo substitui `@query`.
 */
export function FieldAwareTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  pipelineId,
  produto,
  scope = 'any',
  className,
  trigger = '@',
}: FieldAwareTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Cursor é a única fonte de verdade sobre "onde o usuário está".
  // Combinado com `value` (prop), derivamos a menção ativa.
  const [cursor, setCursor] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })

  const mention = useMemo(() => {
    if (cursor === null || dismissed) return null
    return detectMention(value, cursor, trigger)
  }, [value, cursor, dismissed, trigger])

  const matches = useMemo(() => {
    if (!mention) return []
    const term = mention.query.trim().toLowerCase()
    if (!term) return fields.slice(0, 50)
    return fields
      .filter(
        f =>
          f.label.toLowerCase().includes(term) ||
          f.key.toLowerCase().includes(term) ||
          f.sectionLabel.toLowerCase().includes(term),
      )
      .slice(0, 50)
  }, [fields, mention])

  const groups = useMemo(() => groupFields(matches), [matches])

  // Quando a query muda, volta a highlight pra primeira.
  useEffect(() => {
    setHighlightIdx(0)
  }, [mention?.query])

  // Se o dropdown foi dispensado (Esc), reabre quando o usuário mexer no @.
  useEffect(() => {
    if (!dismissed) return
    if (mention === null) setDismissed(false)
  }, [mention, dismissed])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    setCursor(e.target.selectionStart ?? e.target.value.length)
    setDismissed(false)
  }

  const syncCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
  }

  const commitField = (field: CRMField) => {
    if (!mention) return
    const before = value.slice(0, mention.anchor)
    const after = value.slice(mention.anchor + trigger.length + mention.query.length)
    const needsSpaceAfter = after.length > 0 && !/^\s/.test(after)
    const inserted = `${field.key}${needsSpaceAfter ? '' : ' '}`
    const next = before + inserted + after
    const nextCursor = before.length + inserted.length
    onChange(next)
    setCursor(nextCursor)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => (i - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const field = matches[highlightIdx]
      if (field) commitField(field)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDismissed(true)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setCursor(null), 150)}
        placeholder={placeholder}
        rows={rows}
      />

      {mention && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-slate-400">Carregando campos...</div>
          ) : matches.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              Nenhum campo corresponde a &ldquo;{mention.query}&rdquo;.
            </div>
          ) : (
            groups.map(group => (
              <div key={group.sectionLabel}>
                <div className="sticky top-0 z-[1] border-b border-slate-100 bg-slate-50/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                  {group.sectionLabel}
                </div>
                {group.items.map(field => {
                  const flatIdx = matches.indexOf(field)
                  const isActive = flatIdx === highlightIdx
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault()
                        commitField(field)
                      }}
                      onMouseEnter={() => setHighlightIdx(flatIdx)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                        isActive ? 'bg-indigo-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-900">{field.label}</div>
                        <div className="truncate font-mono text-[11px] text-slate-400">{field.key}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface Group {
  sectionLabel: string
  items: CRMField[]
}

function groupFields(fields: CRMField[]): Group[] {
  const map = new Map<string, CRMField[]>()
  for (const f of fields) {
    const arr = map.get(f.sectionLabel) ?? []
    arr.push(f)
    map.set(f.sectionLabel, arr)
  }
  return Array.from(map.entries()).map(([sectionLabel, items]) => ({ sectionLabel, items }))
}

function detectMention(
  text: string,
  cursor: number,
  trigger: string,
): { anchor: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null
  const before = text.slice(0, cursor)
  const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(?:^|\\s)${escapedTrigger}([\\w.]*)$`)
  const match = regex.exec(before)
  if (!match) return null
  const anchor = cursor - match[1].length - trigger.length
  return { anchor, query: match[1] }
}
