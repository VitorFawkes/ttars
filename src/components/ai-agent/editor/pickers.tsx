import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCardTags } from '@/hooks/useCardTags'
import { useAiAgents } from '@/hooks/useAiAgents'
import { usePipelineStages } from '@/hooks/usePipelineStages'

// ─────────────────────────────────────────────────────────────────────────────
// Picker genérico single-select com busca, agrupamento opcional e slot de render.
// Mesmo padrão visual do CRMFieldPicker (lança branco light-mode, indigo accent).
// Adapters concretos abaixo especializam a fonte de dados.
// ─────────────────────────────────────────────────────────────────────────────

export interface PickerOption {
  value: string
  label: string
  /** Linha secundária mostrada em cinza embaixo do label */
  hint?: string | null
  /** Grupo pra agrupamento visual (section header) */
  group?: string
  /** Cor opcional pra bolinha/chip (ex: cor da tag) */
  color?: string | null
}

interface SearchPickerProps {
  value: string | null
  onChange: (value: string | null) => void
  options: PickerOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  isLoading?: boolean
  /** Callback pra permitir criar opção nova quando não encontra (ex: tag nova) */
  onCreateOption?: (label: string) => void | Promise<void>
  createOptionLabel?: (search: string) => string
  /** Label quando vazio total */
  emptyHint?: string
}

export function SearchPicker({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  disabled,
  className,
  isLoading,
  onCreateOption,
  createOptionLabel,
  emptyHint,
}: SearchPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
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

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value])

  const { groups, flatFiltered } = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? options.filter(o =>
          o.label.toLowerCase().includes(term) ||
          o.value.toLowerCase().includes(term) ||
          (o.hint || '').toLowerCase().includes(term) ||
          (o.group || '').toLowerCase().includes(term),
        )
      : options

    const map = new Map<string, PickerOption[]>()
    for (const o of filtered) {
      const key = o.group || ''
      const arr = map.get(key) ?? []
      arr.push(o)
      map.set(key, arr)
    }

    const grp = Array.from(map.entries()).map(([groupLabel, items]) => ({ groupLabel, items }))
    return { groups: grp, flatFiltered: filtered }
  }, [options, search])

  const canCreate = !!onCreateOption && search.trim().length > 1 &&
    !flatFiltered.some(o => o.label.toLowerCase() === search.trim().toLowerCase())

  const handleCreate = async () => {
    if (!onCreateOption) return
    setCreating(true)
    try {
      await onCreateOption(search.trim())
      setSearch('')
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

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
          <span className="flex min-w-0 items-center gap-2">
            {selected.color && (
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
            )}
            <span className="truncate text-sm font-medium text-slate-900">{selected.label}</span>
            {selected.hint && <span className="truncate text-xs text-slate-400">{selected.hint}</span>}
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
        <div className="absolute z-50 mt-1 w-full min-w-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
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
              <div className="p-4 text-center text-xs text-slate-400">Carregando...</div>
            ) : flatFiltered.length === 0 && !canCreate ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {search ? `Nada encontrado para "${search}"` : emptyHint || 'Nenhuma opção disponível'}
              </div>
            ) : (
              <>
                {groups.map(group => (
                  <div key={group.groupLabel || '__default'}>
                    {group.groupLabel && (
                      <div className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {group.groupLabel}
                      </div>
                    )}
                    {group.items.map(option => {
                      const isSelected = option.value === value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            onChange(option.value)
                            setOpen(false)
                            setSearch('')
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50',
                            isSelected && 'bg-indigo-50 hover:bg-indigo-50',
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            {option.color && (
                              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900">{option.label}</div>
                              {option.hint && (
                                <div className="truncate text-[11px] text-slate-400">{option.hint}</div>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-indigo-600" />}
                        </button>
                      )
                    })}
                  </div>
                ))}
                {canCreate && (
                  <button
                    type="button"
                    disabled={creating}
                    onClick={handleCreate}
                    className="flex w-full items-center gap-2 border-t border-slate-100 bg-indigo-50/50 px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {createOptionLabel ? createOptionLabel(search.trim()) : `Criar "${search.trim()}"`}
                    {creating && <span className="ml-auto text-xs text-indigo-500">criando...</span>}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TagPicker — escolhe uma tag existente por nome. Single-select.
// Por padrão escreve o NOME da tag (não o id), porque auto_assign_tag no
// runtime usa o nome (a RPC julia_assign_tag cria se não existir).
// ─────────────────────────────────────────────────────────────────────────────

interface TagPickerProps {
  value: string | null
  onChange: (tagName: string | null) => void
  produto?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TagPicker({ value, onChange, produto, placeholder = 'Escolha uma tag', disabled, className }: TagPickerProps) {
  const { tags, isLoading, createTag } = useCardTags(produto)

  const options: PickerOption[] = useMemo(
    () =>
      (tags ?? []).map(t => ({
        value: t.name,
        label: t.name,
        hint: t.description || null,
        color: t.color,
      })),
    [tags],
  )

  const handleCreate = async (name: string) => {
    try {
      await createTag.mutateAsync({ name, color: '#6366f1', produto })
      onChange(name)
    } catch (err) {
      console.error('Erro ao criar tag:', err)
    }
  }

  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Buscar ou criar tag..."
      disabled={disabled}
      className={className}
      isLoading={isLoading}
      onCreateOption={handleCreate}
      createOptionLabel={s => `Criar tag "${s}"`}
      emptyHint="Nenhuma tag cadastrada. Digite para criar a primeira."
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentPicker — escolhe outro agente IA da mesma org (para escalação).
// ─────────────────────────────────────────────────────────────────────────────

interface AgentPickerProps {
  value: string | null
  onChange: (agentId: string | null) => void
  /** ID do agente atual (será excluído da lista pra não escalar pra si mesmo) */
  excludeId?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function AgentPicker({ value, onChange, excludeId, placeholder = 'Escolha o agente', disabled, className }: AgentPickerProps) {
  const { agents, isLoading } = useAiAgents()

  const options: PickerOption[] = useMemo(
    () =>
      (agents ?? [])
        .filter(a => a.id !== excludeId)
        .map(a => ({
          value: a.id,
          label: a.nome,
          hint: (a as { persona?: string | null }).persona || (a as { descricao?: string | null }).descricao || null,
        })),
    [agents, excludeId],
  )

  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Buscar agente..."
      disabled={disabled}
      className={className}
      isLoading={isLoading}
      emptyHint="Nenhum outro agente nesta workspace."
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StagePicker — escolhe uma etapa do pipeline. Agrupa visualmente por fase.
// ─────────────────────────────────────────────────────────────────────────────

interface StagePickerProps {
  value: string | null
  onChange: (stageId: string | null) => void
  pipelineId?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface StageRow {
  id: string
  nome: string
  ordem: number
}

export function StagePicker({ value, onChange, pipelineId, placeholder = 'Escolha a etapa', disabled, className }: StagePickerProps) {
  const { data: stages, isLoading } = usePipelineStages(pipelineId)

  const options: PickerOption[] = useMemo(() => {
    const list = (stages || []) as unknown as StageRow[]
    return list.map(s => ({
      value: s.id,
      label: s.nome,
      hint: `Etapa ${s.ordem}`,
    }))
  }, [stages])

  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Buscar etapa..."
      disabled={disabled}
      className={className}
      isLoading={isLoading}
      emptyHint={pipelineId ? 'Nenhuma etapa neste pipeline.' : 'Selecione um produto/pipeline primeiro.'}
    />
  )
}
