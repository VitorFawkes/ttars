import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Database, Tag, Wrench, MoveRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldScope } from './CRMFieldPicker'
import {
  useAutocompleteEntities,
  entityToInsertString,
  type EntityType,
  type AutocompleteEntity,
} from './useAutocompleteEntities'

export interface FieldAwareTextareaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  pipelineId?: string
  produto?: string
  agentId?: string
  /** Tipos habilitados no autocomplete. Default: só campos. */
  enabledTypes?: EntityType[]
  scope?: FieldScope
  className?: string
  trigger?: string
  onFocus?: () => void
}

export interface FieldAwareTextareaHandle {
  insertAtCursor: (text: string) => void
  focus: () => void
}

const BOX_STYLE: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  lineHeight: '1.375rem',
  padding: '0.5rem 0.75rem',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: '0.375rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minHeight: '60px',
  margin: 0,
  boxSizing: 'border-box',
}
const MIRROR_STYLE: React.CSSProperties = { ...BOX_STYLE, borderColor: 'transparent' }
const TEXTAREA_STYLE: React.CSSProperties = { ...BOX_STYLE, borderColor: 'rgb(226, 232, 240)' }

// Paleta por tipo — mesmos tons em dropdown, mirror e legendas.
const TYPE_STYLES: Record<EntityType, { chip: string; icon: React.ComponentType<{ className?: string }>; label: string; dot: string }> = {
  field: { chip: 'bg-indigo-100 text-indigo-800', icon: Database, label: 'Campo', dot: 'text-indigo-500' },
  tag: { chip: 'bg-pink-100 text-pink-800', icon: Tag, label: 'Tag', dot: 'text-pink-500' },
  skill: { chip: 'bg-emerald-100 text-emerald-800', icon: Wrench, label: 'Skill', dot: 'text-emerald-600' },
  stage: { chip: 'bg-amber-100 text-amber-800', icon: MoveRight, label: 'Etapa', dot: 'text-amber-600' },
}

export const FieldAwareTextarea = forwardRef<FieldAwareTextareaHandle, FieldAwareTextareaProps>(function FieldAwareTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  pipelineId,
  produto,
  agentId,
  enabledTypes = ['field'],
  scope = 'any',
  className,
  trigger = '@',
  onFocus,
}: FieldAwareTextareaProps, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)

  const { entities, isLoading } = useAutocompleteEntities({
    enabledTypes,
    pipelineId,
    produto,
    agentId,
    fieldScope: scope,
  })

  const knownTokens = useMemo(() => {
    const fields = new Set<string>()
    for (const e of entities) if (e.type === 'field') fields.add(e.id)
    return fields
  }, [entities])

  const tokens = useMemo(() => tokenize(value, knownTokens), [value, knownTokens])

  const mention = useMemo(() => {
    if (cursor === null || dismissed) return null
    return detectMention(value, cursor, trigger)
  }, [value, cursor, dismissed, trigger])

  const matches = useMemo(() => {
    if (!mention) return []
    const term = mention.query.trim().toLowerCase()
    if (!term) return entities.slice(0, 80)
    return entities
      .filter(
        e =>
          e.label.toLowerCase().includes(term) ||
          e.id.toLowerCase().includes(term) ||
          e.section.toLowerCase().includes(term) ||
          (e.sublabel?.toLowerCase().includes(term) ?? false),
      )
      .slice(0, 80)
  }, [entities, mention])

  const groups = useMemo(() => groupEntities(matches), [matches])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset highlight ao mudar query é UI-local
    setHighlightIdx(0)
  }, [mention?.query])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-limpa dismiss quando o usuário sai do contexto do @
    if (dismissed && mention === null) setDismissed(false)
  }, [mention, dismissed])

  const syncScroll = () => {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop
      mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    setCursor(e.target.selectionStart ?? e.target.value.length)
    setDismissed(false)
  }

  const syncCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
  }

  const commitEntity = (entity: AutocompleteEntity) => {
    if (!mention) return
    const before = value.slice(0, mention.anchor)
    const after = value.slice(mention.anchor + trigger.length + mention.query.length)
    const insertCore = entityToInsertString(entity)
    // Adiciona espaço depois do token a não ser que o próximo caractere
    // já seja whitespace. Pro fim do texto (after vazio) adiciona também,
    // pra o usuário continuar digitando sem precisar apertar espaço.
    const needsSpaceAfter = !/^\s/.test(after)
    const inserted = `${insertCore}${needsSpaceAfter ? ' ' : ''}`
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
      const entity = matches[highlightIdx]
      if (entity) commitEntity(entity)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDismissed(true)
    }
  }

  useImperativeHandle(forwardedRef, () => ({
    insertAtCursor: (text: string) => {
      const ta = textareaRef.current
      const start = ta?.selectionStart ?? value.length
      const end = ta?.selectionEnd ?? value.length
      const next = value.slice(0, start) + text + value.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        if (!ta) return
        ta.focus()
        const pos = start + text.length
        ta.setSelectionRange(pos, pos)
      })
    },
    focus: () => textareaRef.current?.focus(),
  }), [value, onChange])

  return (
    <div className={cn('relative', className)}>
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden text-slate-900"
        style={MIRROR_STYLE}
      >
        {tokens.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          tokens.map((t, i) => {
            if (t.kind === 'plain') return <span key={i}>{t.text}</span>
            const style = TYPE_STYLES[t.entityType]
            return (
              <span key={i} className={cn('rounded-sm', style.chip)}>
                {t.text}
              </span>
            )
          })
        )}
        {value.endsWith('\n') && <span>{'​'}</span>}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onFocus={onFocus}
        onBlur={() => setTimeout(() => setCursor(null), 150)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="relative block w-full resize-y bg-transparent text-transparent caret-slate-900 placeholder:text-transparent focus-visible:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100"
        style={TEXTAREA_STYLE}
      />

      {mention && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-slate-400">Carregando...</div>
          ) : matches.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              Nenhum item corresponde a &ldquo;{mention.query}&rdquo;.
            </div>
          ) : (
            groups.map(group => {
              const style = TYPE_STYLES[group.type]
              const Icon = style.icon
              return (
                <div key={group.section}>
                  <div className="sticky top-0 z-[1] flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                    <Icon className={cn('h-3 w-3', style.dot)} />
                    {group.section}
                  </div>
                  {group.items.map(entity => {
                    const flatIdx = matches.indexOf(entity)
                    const isActive = flatIdx === highlightIdx
                    return (
                      <button
                        key={`${entity.type}:${entity.id}`}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault()
                          commitEntity(entity)
                        }}
                        onMouseEnter={() => setHighlightIdx(flatIdx)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                          isActive ? 'bg-indigo-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <span className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm', style.chip)}>
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-900">{entity.label}</div>
                          {entity.sublabel && (
                            <div className="truncate font-mono text-[11px] text-slate-400">{entity.sublabel}</div>
                          )}
                        </div>
                        <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                          {style.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
})

// ---------- helpers ----------

type Token =
  | { kind: 'plain'; text: string }
  | { kind: 'entity'; entityType: EntityType; text: string }

/**
 * Tokeniza o texto em pedaços, detectando:
 * - Identificadores word-like que batem exatamente com uma key de campo conhecida.
 * - Tokens estruturados `@[tag:...]`, `@[skill:...]`, `@[etapa:...]`.
 */
function tokenize(value: string, fieldKeys: Set<string>): Token[] {
  if (!value) return []
  const out: Token[] = []
  // Regex combina: (1) tokens @[tipo:valor] estruturados; (2) identificadores word-like
  const re = /(@\[(?:tag|skill|etapa):[^\]]+\])|([A-Za-z_][A-Za-z0-9_]{2,})/g
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    if (m.index > cursor) {
      out.push({ kind: 'plain', text: value.slice(cursor, m.index) })
    }
    const matched = m[0]
    if (m[1]) {
      // @[tipo:valor]
      const prefix = matched.slice(2).split(':')[0]
      const entityType: EntityType = prefix === 'tag' ? 'tag' : prefix === 'skill' ? 'skill' : 'stage'
      out.push({ kind: 'entity', entityType, text: matched })
    } else if (m[2] && fieldKeys.has(m[2])) {
      out.push({ kind: 'entity', entityType: 'field', text: matched })
    } else {
      out.push({ kind: 'plain', text: matched })
    }
    cursor = m.index + matched.length
  }
  if (cursor < value.length) out.push({ kind: 'plain', text: value.slice(cursor) })
  return out
}

interface Group {
  section: string
  type: EntityType
  items: AutocompleteEntity[]
}

function groupEntities(entities: AutocompleteEntity[]): Group[] {
  const map = new Map<string, Group>()
  for (const e of entities) {
    const existing = map.get(e.section)
    if (existing) {
      existing.items.push(e)
    } else {
      map.set(e.section, { section: e.section, type: e.type, items: [e] })
    }
  }
  // Ordem fixa por tipo: campos → tags → skills → etapas
  const typeOrder: EntityType[] = ['field', 'tag', 'skill', 'stage']
  return Array.from(map.values()).sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type))
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
