import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldConfig } from '@/hooks/useFieldConfig'
import { useSections } from '@/hooks/useSections'

export type FieldScope = 'card' | 'contact' | 'any'

export interface CRMField {
  key: string
  label: string
  type: string
  section: string
  sectionLabel: string
  origin: 'card' | 'contact' | 'ai'
}

const CARD_BUILTIN: CRMField[] = [
  { key: 'titulo', label: 'Título do card', type: 'text', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'valor_estimado', label: 'Valor estimado', type: 'currency', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'valor_final', label: 'Valor final', type: 'currency', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'pipeline_stage_id', label: 'Etapa do pipeline', type: 'select', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'dono_atual_id', label: 'Responsável', type: 'select', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'produto', label: 'Produto', type: 'text', section: '__card_core', sectionLabel: 'Dados do card', origin: 'card' },
  { key: 'ai_resumo', label: 'Resumo IA', type: 'textarea', section: '__card_ai', sectionLabel: 'Inteligência (IA)', origin: 'ai' },
  { key: 'ai_contexto', label: 'Contexto IA', type: 'textarea', section: '__card_ai', sectionLabel: 'Inteligência (IA)', origin: 'ai' },
]

const CONTACT_BUILTIN: CRMField[] = [
  { key: 'nome', label: 'Nome', type: 'text', section: '__contato_core', sectionLabel: 'Contato', origin: 'contact' },
  { key: 'sobrenome', label: 'Sobrenome', type: 'text', section: '__contato_core', sectionLabel: 'Contato', origin: 'contact' },
  { key: 'telefone', label: 'Telefone', type: 'text', section: '__contato_core', sectionLabel: 'Contato', origin: 'contact' },
  { key: 'email', label: 'Email', type: 'text', section: '__contato_core', sectionLabel: 'Contato', origin: 'contact' },
  { key: 'observacoes', label: 'Observações', type: 'textarea', section: '__contato_core', sectionLabel: 'Contato', origin: 'contact' },
  { key: 'cpf', label: 'CPF', type: 'text', section: '__contato_doc', sectionLabel: 'Documentos', origin: 'contact' },
  { key: 'passaporte', label: 'Passaporte', type: 'text', section: '__contato_doc', sectionLabel: 'Documentos', origin: 'contact' },
  { key: 'data_nascimento', label: 'Data de nascimento', type: 'date', section: '__contato_doc', sectionLabel: 'Documentos', origin: 'contact' },
  { key: 'cidade', label: 'Cidade', type: 'text', section: '__contato_local', sectionLabel: 'Localização', origin: 'contact' },
  { key: 'estado', label: 'Estado', type: 'text', section: '__contato_local', sectionLabel: 'Localização', origin: 'contact' },
  { key: 'endereco', label: 'Endereço', type: 'text', section: '__contato_local', sectionLabel: 'Localização', origin: 'contact' },
  { key: 'empresa', label: 'Empresa', type: 'text', section: '__contato_local', sectionLabel: 'Localização', origin: 'contact' },
]

const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  text: { label: 'Texto', cls: 'bg-slate-100 text-slate-600' },
  textarea: { label: 'Texto longo', cls: 'bg-slate-100 text-slate-600' },
  number: { label: 'Número', cls: 'bg-blue-50 text-blue-700' },
  date: { label: 'Data', cls: 'bg-amber-50 text-amber-700' },
  datetime: { label: 'Data e hora', cls: 'bg-amber-50 text-amber-700' },
  date_range: { label: 'Período', cls: 'bg-amber-50 text-amber-700' },
  flexible_date: { label: 'Data', cls: 'bg-amber-50 text-amber-700' },
  flexible_duration: { label: 'Duração', cls: 'bg-amber-50 text-amber-700' },
  currency: { label: 'Valor', cls: 'bg-emerald-50 text-emerald-700' },
  currency_range: { label: 'Faixa de valor', cls: 'bg-emerald-50 text-emerald-700' },
  smart_budget: { label: 'Orçamento', cls: 'bg-emerald-50 text-emerald-700' },
  select: { label: 'Seleção', cls: 'bg-purple-50 text-purple-700' },
  multiselect: { label: 'Múltipla', cls: 'bg-purple-50 text-purple-700' },
  checklist: { label: 'Lista', cls: 'bg-purple-50 text-purple-700' },
  boolean: { label: 'Sim/Não', cls: 'bg-indigo-50 text-indigo-700' },
  json: { label: 'JSON', cls: 'bg-slate-100 text-slate-600' },
  loss_reason_selector: { label: 'Seleção', cls: 'bg-purple-50 text-purple-700' },
}

function typeBadge(t: string) {
  return TYPE_BADGES[t] ?? { label: t, cls: 'bg-slate-100 text-slate-500' }
}

export function useCRMFields({
  scope = 'any',
  pipelineId,
  produto,
}: {
  scope?: FieldScope
  pipelineId?: string
  produto?: string
}): { fields: CRMField[]; isLoading: boolean } {
  const { systemFields, isLoading: loadingFields } = useFieldConfig(pipelineId)
  const { data: sections, isLoading: loadingSections } = useSections(produto)

  const fields = useMemo<CRMField[]>(() => {
    const out: CRMField[] = []
    if (scope === 'card' || scope === 'any') out.push(...CARD_BUILTIN)
    if (scope === 'contact' || scope === 'any') out.push(...CONTACT_BUILTIN)

    if ((scope === 'card' || scope === 'any') && systemFields) {
      const sectionLabelMap = new Map((sections ?? []).map(s => [s.key, s.label]))
      const allowedSections = sections ? new Set(sections.map(s => s.key)) : null
      for (const f of systemFields) {
        const sec = f.section || 'details'
        if (produto && allowedSections && !allowedSections.has(sec)) continue
        out.push({
          key: f.key,
          label: f.label,
          type: f.type,
          section: sec,
          sectionLabel: sectionLabelMap.get(sec) ?? sec,
          origin: 'card',
        })
      }
    }

    return out
  }, [scope, produto, systemFields, sections])

  return { fields, isLoading: loadingFields || loadingSections }
}

interface GroupedField {
  sectionLabel: string
  items: CRMField[]
}

function groupFields(fields: CRMField[], search: string): GroupedField[] {
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

interface BaseProps {
  scope?: FieldScope
  pipelineId?: string
  produto?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Extra options to merge (e.g. card-specific synthetic keys) */
  extraFields?: CRMField[]
  /** Allow free-form value even when not in the list. Shown as a "custom" chip. */
  allowCustom?: boolean
}

interface SingleProps extends BaseProps {
  value: string | null
  onChange: (value: string | null) => void
}

export function SingleFieldPicker({
  value,
  onChange,
  scope = 'any',
  pipelineId,
  produto,
  placeholder = 'Selecione um campo',
  disabled,
  className,
  extraFields,
  allowCustom,
}: SingleProps) {
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })
  const allFields = useMemo(() => [...(extraFields ?? []), ...fields], [extraFields, fields])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const selected = useMemo(() => allFields.find(f => f.key === value) ?? null, [allFields, value])
  const groups = useMemo(() => groupFields(allFields, search), [allFields, search])
  const hasCustomValue = value && !selected

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200',
          disabled && 'cursor-not-allowed opacity-50',
          open && 'border-indigo-300 ring-2 ring-indigo-200',
        )}
      >
        {selected ? (
          <FieldChip field={selected} />
        ) : hasCustomValue ? (
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-600">{value}</span>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">personalizado</span>
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation()
                onChange(null)
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
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
                <span
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-400">Carregando campos...</div>
            ) : groups.length === 0 ? (
              <EmptyState
                search={search}
                allowCustom={allowCustom}
                onUseCustom={() => {
                  onChange(search.trim())
                  setOpen(false)
                  setSearch('')
                }}
              />
            ) : (
              groups.map(group => (
                <div key={group.sectionLabel}>
                  <SectionHeader label={group.sectionLabel} />
                  {group.items.map(field => {
                    const isSelected = field.key === value
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => {
                          onChange(field.key)
                          setOpen(false)
                          setSearch('')
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                          isSelected && 'bg-indigo-50 hover:bg-indigo-50',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900">{field.label}</div>
                          <div className="truncate font-mono text-[11px] text-slate-400">{field.key}</div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <TypeBadge type={field.type} />
                          {isSelected && <Check className="h-4 w-4 text-indigo-600" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface MultiProps extends BaseProps {
  value: string[]
  onChange: (value: string[]) => void
  maxChipsVisible?: number
}

export function MultiFieldPicker({
  value,
  onChange,
  scope = 'any',
  pipelineId,
  produto,
  placeholder = 'Selecione campos',
  disabled,
  className,
  extraFields,
  allowCustom,
  maxChipsVisible = 3,
}: MultiProps) {
  const { fields, isLoading } = useCRMFields({ scope, pipelineId, produto })
  const allFields = useMemo(() => [...(extraFields ?? []), ...fields], [extraFields, fields])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const selectedSet = useMemo(() => new Set(value), [value])
  const selectedFields = useMemo(() => {
    const map = new Map(allFields.map(f => [f.key, f]))
    return value.map(k => map.get(k) ?? { key: k, label: k, type: 'text', section: '__custom', sectionLabel: 'Personalizado', origin: 'card' as const })
  }, [allFields, value])
  const groups = useMemo(() => groupFields(allFields, search), [allFields, search])

  const toggle = (key: string) => {
    if (selectedSet.has(key)) onChange(value.filter(v => v !== key))
    else onChange([...value, key])
  }

  const remove = (key: string) => onChange(value.filter(v => v !== key))
  const clearAll = () => onChange([])

  const visibleChips = selectedFields.slice(0, maxChipsVisible)
  const hiddenCount = Math.max(0, selectedFields.length - maxChipsVisible)

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={cn(
          'flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-sm shadow-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200',
          disabled && 'cursor-not-allowed opacity-50',
          open && 'border-indigo-300 ring-2 ring-indigo-200',
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {selectedFields.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            <>
              {visibleChips.map(f => {
                const isUnknown = !allFields.some(a => a.key === f.key)
                return (
                  <span
                    key={f.key}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
                      isUnknown
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-indigo-100 bg-indigo-50 text-indigo-700',
                    )}
                  >
                    <span className="font-medium">{f.label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => {
                        e.stopPropagation()
                        remove(f.key)
                      }}
                      className="rounded-sm text-indigo-400 hover:text-indigo-700"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                )
              })}
              {hiddenCount > 0 && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">+{hiddenCount}</span>
              )}
            </>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {selectedFields.length > 0 && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation()
                clearAll()
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Limpar todos"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[340px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
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
                <span
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-slate-400">Carregando campos...</div>
            ) : groups.length === 0 ? (
              <EmptyState
                search={search}
                allowCustom={allowCustom}
                onUseCustom={() => {
                  const v = search.trim()
                  if (v && !selectedSet.has(v)) onChange([...value, v])
                  setSearch('')
                }}
              />
            ) : (
              groups.map(group => (
                <div key={group.sectionLabel}>
                  <SectionHeader label={group.sectionLabel} />
                  {group.items.map(field => {
                    const isSelected = selectedSet.has(field.key)
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => toggle(field.key)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                          isSelected && 'bg-indigo-50 hover:bg-indigo-50',
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            className={cn(
                              'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
                              isSelected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 bg-white',
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-900">{field.label}</div>
                            <div className="truncate font-mono text-[11px] text-slate-400">{field.key}</div>
                          </div>
                        </div>
                        <TypeBadge type={field.type} />
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {selectedFields.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-500">
                {selectedFields.length} selecionado{selectedFields.length > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const b = typeBadge(type)
  return <span className={cn('flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', b.cls)}>{b.label}</span>
}

function FieldChip({ field }: { field: CRMField }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm font-medium text-slate-900">{field.label}</span>
      <span className="truncate font-mono text-[11px] text-slate-400">{field.key}</span>
      <TypeBadge type={field.type} />
    </span>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </div>
  )
}

function EmptyState({
  search,
  allowCustom,
  onUseCustom,
}: {
  search: string
  allowCustom?: boolean
  onUseCustom: () => void
}) {
  if (allowCustom && search.trim()) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-center text-xs text-slate-400">Nenhum campo encontrado para &ldquo;{search}&rdquo;.</p>
        <button
          type="button"
          onClick={onUseCustom}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          <Plus className="h-3.5 w-3.5" /> Usar &ldquo;{search.trim()}&rdquo; mesmo assim
        </button>
      </div>
    )
  }
  return (
    <div className="p-4 text-center text-xs text-slate-400">
      {search ? `Nenhum campo encontrado para "${search}".` : 'Nenhum campo disponível.'}
    </div>
  )
}
