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

interface MentionState {
  /** Posicao do trigger no `value`. */
  anchor: number
  /** Texto digitado depois do trigger (termo de busca). */
  query: string
}

/**
 * Textarea com autocomplete de campos do CRM.
 * Ao digitar `@`, abre uma lista filtravel logo abaixo do textarea.
 * Selecionar substitui `@query` pela `key` do campo.
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
  const [mention, setMention] = useState<MentionState | null>(null)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })

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

  useEffect(() => {
    setHighlightIdx(0)
  }, [mention?.query])

  const detectMention = (text: string, cursor: number): MentionState | null => {
    const before = text.slice(0, cursor)
    const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?:^|\\s)${escapedTrigger}([\\w.]*)$`)
    const match = regex.exec(before)
    if (!match) return null
    const anchor = cursor - match[1].length - trigger.length
    return { anchor, query: match[1] }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    onChange(next)
    const cursor = e.target.selectionStart ?? next.length
    setMention(detectMention(next, cursor))
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') return
    const cursor = e.currentTarget.selectionStart ?? value.length
    setMention(detectMention(value, cursor))
  }

  const commitField = (field: CRMField) => {
    if (!mention) return
    const before = value.slice(0, mention.anchor)
    const after = value.slice(mention.anchor + trigger.length + mention.query.length)
    const needsSpaceAfter = after.length > 0 && !/^\s/.test(after)
    const inserted = `${field.key}${needsSpaceAfter ? '' : ' '}`
    const next = before + inserted + after
    onChange(next)
    setMention(null)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const pos = before.length + inserted.length
      ta.focus()
      ta.setSelectionRange(pos, pos)
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
      setMention(null)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 150)}
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
