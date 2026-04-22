import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Plus } from 'lucide-react'
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
}

export function FieldAwareTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  pipelineId,
  produto,
  scope = 'any',
  className,
}: FieldAwareTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
  }, [open])

  const groups = useMemo(() => groupByLabel(fields, search), [fields, search])

  const insertField = (field: CRMField) => {
    const textarea = textareaRef.current
    const selStart = textarea?.selectionStart ?? value.length
    const selEnd = textarea?.selectionEnd ?? value.length
    const before = value.slice(0, selStart)
    const after = value.slice(selEnd)
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before)
    const needsSpaceAfter = after.length > 0 && !/^\s/.test(after)
    const insert = `${needsSpaceBefore ? ' ' : ''}${field.key}${needsSpaceAfter ? ' ' : ''}`
    const next = before + insert + after
    onChange(next)
    setOpen(false)
    setSearch('')
    requestAnimationFrame(() => {
      if (!textarea) return
      const pos = before.length + insert.length
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Plus className="h-3 w-3" />
          Inserir campo do CRM
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[320px] max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar campo..."
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-8 text-sm placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-400">Carregando campos...</div>
            ) : groups.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Nenhum campo encontrado para &ldquo;{search}&rdquo;.
              </div>
            ) : (
              groups.map(group => (
                <div key={group.sectionLabel}>
                  <div className="sticky top-0 z-[1] border-b border-slate-100 bg-slate-50/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                    {group.sectionLabel}
                  </div>
                  {group.items.map(field => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => insertField(field)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-indigo-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">{field.label}</div>
                        <div className="truncate font-mono text-[11px] text-slate-400">{field.key}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface Group {
  sectionLabel: string
  items: CRMField[]
}

function groupByLabel(fields: CRMField[], search: string): Group[] {
  const term = search.trim().toLowerCase()
  const filtered = term
    ? fields.filter(
        f =>
          f.label.toLowerCase().includes(term) ||
          f.key.toLowerCase().includes(term) ||
          f.sectionLabel.toLowerCase().includes(term),
      )
    : fields

  const map = new Map<string, CRMField[]>()
  for (const f of filtered) {
    const arr = map.get(f.sectionLabel) ?? []
    arr.push(f)
    map.set(f.sectionLabel, arr)
  }
  return Array.from(map.entries()).map(([sectionLabel, items]) => ({ sectionLabel, items }))
}
