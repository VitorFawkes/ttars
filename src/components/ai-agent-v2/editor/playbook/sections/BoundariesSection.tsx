import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, X, FolderPlus, Trash2, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentBoundaries, type BoundariesConfig, type BoundaryItem } from '@/hooks/v2/playbook/useAgentBoundaries'
import { BOUNDARIES_LIBRARY } from '@/lib/playbook/boundariesLibrary'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Categorias visíveis por padrão. Cada categoria da biblioteca também aparece
 * mesmo que o admin nunca tenha tocado nela — assim a biblioteca toda está
 * disponível desde a primeira abertura.
 */
const DEFAULT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'comercial', label: 'Comercial' },
  { key: 'comunicacao', label: 'Comunicação' },
  { key: 'marca', label: 'Marca' },
  { key: 'comportamento', label: 'Comportamento' },
]

const LIBRARY_KEY_TO_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.key, c.label]),
)

type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

/**
 * Migra legacy (library_active + custom_by_category) para o formato novo
 * by_category. Roda uma vez no primeiro load. Depois disso o save sempre
 * persiste no formato novo.
 */
function migrateLegacy(config: BoundariesConfig | null): Record<string, BoundaryItem[]> {
  if (config?.by_category) return config.by_category

  const out: Record<string, BoundaryItem[]> = {}
  const libraryActive = new Set(config?.library_active ?? [])

  // 1. Espelha biblioteca: cada item vira BoundaryItem com enabled = está em library_active
  for (const lib of BOUNDARIES_LIBRARY) {
    const catLabel = LIBRARY_KEY_TO_LABEL[lib.category] ?? lib.category
    if (!out[catLabel]) out[catLabel] = []
    out[catLabel].push({
      text: lib.label,
      description: lib.description,
      enabled: libraryActive.has(lib.id),
      library_id: lib.id,
    })
  }

  // 2. Custom por categoria — items viram enabled=true (sempre estavam ativos no legacy)
  for (const [cat, items] of Object.entries(config?.custom_by_category ?? {})) {
    if (!out[cat]) out[cat] = []
    for (const text of items) {
      if (!text || !text.trim()) continue
      out[cat].push({ text: text.trim(), enabled: true })
    }
  }

  // 3. Legacy custom flat — joga numa categoria "Personalizado"
  for (const text of config?.custom ?? []) {
    if (!text || !text.trim()) continue
    if (!out['Personalizado']) out['Personalizado'] = []
    out['Personalizado'].push({ text: text.trim(), enabled: true })
  }

  return out
}

export function BoundariesSection({ agentId, agentName, companyName }: Props) {
  const { boundaries, isLoading, save } = useAgentBoundaries(agentId)
  const [byCategory, setByCategory] = useState<Record<string, BoundaryItem[]>>({})
  const [newItemByCategory, setNewItemByCategory] = useState<Record<string, string>>({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestStateRef = useRef<Record<string, BoundaryItem[]>>({})
  const initializedRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const migrated = migrateLegacy(boundaries)
    setByCategory(migrated)
    latestStateRef.current = migrated
    initializedRef.current = true
    setSaveStatus('idle')
  }, [boundaries])
  /* eslint-enable react-hooks/set-state-in-effect */

  const scheduleSave = (next: Record<string, BoundaryItem[]>) => {
    latestStateRef.current = next
    setSaveStatus('pending')
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      const config: BoundariesConfig = {
        by_category: latestStateRef.current,
        // Limpa legacy: o backend lê by_category quando presente.
        library_active: [],
        custom: [],
        custom_by_category: {},
      }
      try {
        await save.mutateAsync(config)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
      } catch (err) {
        console.error('[BoundariesSection] auto-save error:', err)
        setSaveStatus('error')
        toast.error('Não consegui salvar. Verifique sua conexão.')
      }
    }, 600)
  }

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }, [])

  const toggleItem = (cat: string, idx: number) => {
    const items = byCategory[cat] ?? []
    const next = {
      ...byCategory,
      [cat]: items.map((it, i) => i === idx ? { ...it, enabled: !it.enabled } : it),
    }
    setByCategory(next)
    if (initializedRef.current) scheduleSave(next)
  }

  const removeItem = (cat: string, idx: number) => {
    const items = byCategory[cat] ?? []
    const next = { ...byCategory, [cat]: items.filter((_, i) => i !== idx) }
    setByCategory(next)
    scheduleSave(next)
  }

  /**
   * Override do texto que vai pro LLM. Quando string vazia, limpa o override
   * (volta a usar o texto padrão da biblioteca). Usado pelo popover de edição
   * inline (botão lápis ao lado de cada item enabled).
   */
  const setCustomText = (cat: string, idx: number, value: string) => {
    const items = byCategory[cat] ?? []
    const trimmed = value.trim()
    const next = {
      ...byCategory,
      [cat]: items.map((it, i) =>
        i === idx
          ? { ...it, custom_text: trimmed.length > 0 ? trimmed : undefined }
          : it,
      ),
    }
    setByCategory(next)
    scheduleSave(next)
  }

  const addItem = (cat: string, textOverride?: string) => {
    const text = (textOverride ?? newItemByCategory[cat] ?? '').trim()
    if (!text) return
    const items = byCategory[cat] ?? []
    const next = {
      ...byCategory,
      [cat]: [...items, { text, enabled: true } as BoundaryItem],
    }
    setByCategory(next)
    if (!textOverride) setNewItemByCategory(prev => ({ ...prev, [cat]: '' }))
    scheduleSave(next)
  }

  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    if (byCategory[name]) { toast.error('Essa categoria já existe'); return }
    const next = { ...byCategory, [name]: [] }
    setByCategory(next)
    setNewCategoryName('')
    setShowAddCategory(false)
    scheduleSave(next)
  }

  const removeCategory = (cat: string) => {
    const count = (byCategory[cat] ?? []).length
    if (count > 0 && !confirm(`Apagar a categoria "${cat}" e as ${count} linha(s) dentro dela?`)) return
    const next = { ...byCategory }
    delete next[cat]
    setByCategory(next)
    scheduleSave(next)
  }

  const allCategories = useMemo(() => {
    return Array.from(new Set([
      ...DEFAULT_CATEGORIES.map(c => c.label),
      ...Object.keys(byCategory),
    ]))
  }, [byCategory])

  const isDefaultCategory = (cat: string) => DEFAULT_CATEGORIES.some(c => c.label === cat)

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-medium text-slate-900">Linhas vermelhas</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Coisas que a agente NUNCA faz. Marque pra ativar, X pra remover.
            Adicione novas regras digitando no campo de cada categoria.
          </p>
        </div>
        {!showAddCategory && (
          <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)} className="gap-1.5">
            <FolderPlus className="w-3.5 h-3.5" /> Nova categoria
          </Button>
        )}
      </div>

      {showAddCategory && (
        <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
            placeholder="Nome da categoria (ex: Valores, Política interna)"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" autoFocus />
          <Button size="sm" onClick={addCategory} className="gap-1"><Plus className="w-3.5 h-3.5" /> Criar</Button>
          <Button size="sm" variant="outline" onClick={() => { setNewCategoryName(''); setShowAddCategory(false) }}>Cancelar</Button>
        </div>
      )}

      <div className="space-y-4">
        {allCategories.map(cat => {
          const items = byCategory[cat] ?? []
          return (
            <div key={cat} className="border border-slate-200 rounded-lg bg-white">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
                <h5 className="text-xs font-medium text-slate-700 uppercase tracking-wide">{cat}</h5>
                <div className="flex items-center gap-2">
                  <SuggestVariationsButton
                    text=""
                    fieldType="red_line"
                    context={{ agent_nome: agentName, company_name: companyName, related_moment_label: cat }}
                    onSelect={(t) => addItem(cat, t)}
                    label="Sugerir"
                  />
                  {!isDefaultCategory(cat) && (
                    <button onClick={() => removeCategory(cat)} className="text-slate-400 hover:text-red-600"
                      title="Apagar categoria">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">(nenhuma regra nesta categoria)</p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((it, i) => (
                      <BoundaryItemRow
                        key={i}
                        item={it}
                        onToggle={() => toggleItem(cat, i)}
                        onRemove={() => removeItem(cat, i)}
                        onSaveCustomText={(text) => setCustomText(cat, i, text)}
                      />
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <input
                    value={newItemByCategory[cat] ?? ''}
                    onChange={(e) => setNewItemByCategory(prev => ({ ...prev, [cat]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(cat) } }}
                    placeholder="Ex: Nunca dar desconto sem aprovação"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" />
                  <Button size="sm" variant="outline" onClick={() => addItem(cat)} className="gap-1">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end items-center pt-2 border-t border-slate-100 text-xs text-slate-500 min-h-[28px]">
        {saveStatus === 'pending' && (
          <span className="flex items-center gap-1.5 text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <Check className="w-3.5 h-3.5" /> Salvo automaticamente
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-rose-600">Erro ao salvar — tente de novo</span>
        )}
        {saveStatus === 'idle' && (
          <span className="text-slate-400">Suas alterações são salvas automaticamente</span>
        )}
      </div>
    </div>
  )
}

/**
 * Item de regra com inline-edit do texto que vai pro LLM.
 *
 * Visual padrão: checkbox + label + descrição + botão remover.
 * Quando o usuário clica no lápis, abre textarea inline pra customizar o
 * `custom_text` (override do padrão). Salvar fecha; limpar e salvar volta
 * a usar o texto padrão da biblioteca.
 */
function BoundaryItemRow({
  item,
  onToggle,
  onRemove,
  onSaveCustomText,
}: {
  item: BoundaryItem
  onToggle: () => void
  onRemove: () => void
  onSaveCustomText: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const hasCustomText = !!(item.custom_text && item.custom_text.trim())
  const startEdit = () => {
    // Pré-preenche com custom_text se existir, senão com description (texto
    // padrão da biblioteca) — admin enxerga o ponto de partida.
    setDraft(item.custom_text || item.description || item.text || '')
    setEditing(true)
  }
  const save = () => {
    onSaveCustomText(draft)
    setEditing(false)
  }
  const cancel = () => {
    setEditing(false)
    setDraft('')
  }
  const reset = () => {
    onSaveCustomText('')
    setEditing(false)
  }

  return (
    <li
      className={cn(
        'rounded-md border transition-colors',
        item.enabled ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200',
      )}
    >
      <div className="flex items-start gap-2 p-2">
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={onToggle}
          className="mt-0.5 cursor-pointer"
          title={item.enabled ? 'Desativar' : 'Ativar'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                'text-sm',
                item.enabled ? 'text-slate-900 font-medium' : 'text-slate-500',
              )}
            >
              {item.text}
            </span>
            {hasCustomText && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium"
                title="Texto customizado para o agente"
              >
                editado
              </span>
            )}
          </div>
          {item.description && !hasCustomText && (
            <p
              className={cn(
                'text-xs mt-0.5',
                item.enabled ? 'text-slate-500' : 'text-slate-400',
              )}
            >
              {item.description}
            </p>
          )}
          {hasCustomText && (
            <p className="text-xs mt-0.5 text-slate-700 italic">
              {item.custom_text}
            </p>
          )}
        </div>
        {item.enabled && !editing && (
          <button
            onClick={startEdit}
            className="text-slate-400 hover:text-indigo-600 p-0.5"
            title="Editar texto que vai pro agente"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-slate-400 hover:text-red-600 p-0.5"
          title="Remover"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {editing && (
        <div className="border-t border-rose-200 bg-white/60 p-2 space-y-2">
          <label className="block text-[11px] text-slate-600 font-medium">
            Texto que o agente vê (substitui o padrão da biblioteca)
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
            placeholder={item.description || 'Escreva a regra com as palavras que vão pro agente'}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            {hasCustomText && (
              <Button size="sm" variant="ghost" onClick={reset} title="Volta a usar o texto padrão da biblioteca">
                Resetar pro padrão
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={cancel}>Cancelar</Button>
            <Button size="sm" onClick={save}>Salvar</Button>
          </div>
        </div>
      )}
    </li>
  )
}
