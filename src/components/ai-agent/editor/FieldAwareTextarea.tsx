import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
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
  /** Callback quando o textarea ganha foco — usado pra saber qual bloco está ativo em abas com múltiplos campos. */
  onFocus?: () => void
}

export interface FieldAwareTextareaHandle {
  /** Insere texto na posição do cursor (ou no fim se não focado). */
  insertAtCursor: (text: string) => void
  focus: () => void
}

// Estilo de caixa compartilhado. Fonte/padding/border-width/wrapping têm que
// bater byte-a-byte entre textarea e mirror pra alinhar pixel-perfect. Só a
// COR da borda difere: mirror = transparente (invisível), textarea = slate-200.
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

/**
 * Textarea com autocomplete de campos do CRM e destaque visual.
 * - Digitar `@` abre a lista filtrável; selecionar insere a key.
 * - Campos reconhecidos (ex: ww_sdr_ajuda_familia) ficam destacados
 *   como chip colorido enquanto você digita.
 * - O valor reportado continua texto plano — destaque é só visual.
 */
export const FieldAwareTextarea = forwardRef<FieldAwareTextareaHandle, FieldAwareTextareaProps>(function FieldAwareTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  pipelineId,
  produto,
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
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })

  const keySet = useMemo(() => new Set(fields.map(f => f.key)), [fields])
  const tokens = useMemo(() => tokenize(value, keySet), [value, keySet])

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

  // API imperativa pra telas com múltiplos campos (ex: TabPrompts) inserirem
  // texto via botão de variáveis. Precisa vir ANTES do return.
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
      {/* Mirror: desenha o texto com chips destacados. Fica POR BAIXO do
          textarea (que tem texto transparente, cursor visível). */}
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden text-slate-900"
        style={MIRROR_STYLE}
      >
        {tokens.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          tokens.map((t, i) =>
            t.isField ? (
              // IMPORTANTE: sem padding/border/font diferente — qualquer coisa
              // que mude a largura do texto desalinha o mirror do textarea.
              // Background + cor só.
              <span key={i} className="rounded-sm bg-indigo-100 text-indigo-800">
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            ),
          )
        )}
        {/* Força nova linha no fim se o texto termina com \n (o mirror não
            renderiza a linha extra sozinho como o textarea faz). */}
        {value.endsWith('\n') && <span>{'​'}</span>}
      </div>

      {/* Textarea: texto transparente (só caret visível), placeholder
          transparente (o mirror mostra o placeholder). */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onBlur={() => setTimeout(() => setCursor(null), 150)}
        onFocus={onFocus}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="relative block w-full resize-y bg-transparent text-transparent caret-slate-900 placeholder:text-transparent focus-visible:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100"
        style={TEXTAREA_STYLE}
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
})

interface Token {
  text: string
  isField: boolean
}

/**
 * Quebra o texto em tokens. Sequências que batem exatamente com uma key
 * de campo do CRM viram tokens marcados como isField=true.
 */
function tokenize(value: string, keySet: Set<string>): Token[] {
  if (!value) return []
  const parts = value.split(/([A-Za-z_][A-Za-z0-9_]{2,})/g)
  const out: Token[] = []
  for (const p of parts) {
    if (p === '') continue
    out.push({ text: p, isField: keySet.has(p) })
  }
  return out
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
