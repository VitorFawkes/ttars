import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X, FolderPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAgentBoundaries, type BoundariesConfig } from '@/hooks/playbook/useAgentBoundaries'
import { BOUNDARIES_LIBRARY } from '@/lib/playbook/boundariesLibrary'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

const DEFAULT_CATEGORIES = ['Comercial', 'Comunicação', 'Marca', 'Comportamento']

export function BoundariesSection({ agentId, agentName, companyName }: Props) {
  const { boundaries, isLoading, save } = useAgentBoundaries(agentId)
  const [active, setActive] = useState<string[]>([])
  const [customByCategory, setCustomByCategory] = useState<Record<string, string[]>>({})
  const [newItemByCategory, setNewItemByCategory] = useState<Record<string, string>>({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setActive(boundaries?.library_active ?? [])
    // Migração silenciosa: se existe `custom` legacy, põe em categoria "Personalizado"
    const cbc: Record<string, string[]> = { ...(boundaries?.custom_by_category ?? {}) }
    const legacyCustom = boundaries?.custom ?? []
    if (legacyCustom.length > 0 && !cbc['Personalizado']) {
      cbc['Personalizado'] = legacyCustom
    }
    setCustomByCategory(cbc)
    setDirty(false)
  }, [boundaries?.library_active, boundaries?.custom, boundaries?.custom_by_category])

  const markDirty = () => setDirty(true)
  const toggle = (id: string) => {
    if (active.includes(id)) setActive(active.filter(x => x !== id))
    else setActive([...active, id])
    markDirty()
  }

  const handleSave = async () => {
    const config: BoundariesConfig = {
      library_active: active,
      custom_by_category: customByCategory,
      custom: [], // zera legacy (agora tudo vive em custom_by_category)
    }
    try { await save.mutateAsync(config); toast.success('Linhas vermelhas salvas'); setDirty(false) }
    catch (err) { console.error(err); toast.error('Não consegui salvar.') }
  }

  const addItem = (cat: string) => {
    const text = (newItemByCategory[cat] ?? '').trim()
    if (!text) return
    setCustomByCategory(prev => ({ ...prev, [cat]: [...(prev[cat] ?? []), text] }))
    setNewItemByCategory(prev => ({ ...prev, [cat]: '' }))
    markDirty()
  }
  const removeItem = (cat: string, idx: number) => {
    setCustomByCategory(prev => ({ ...prev, [cat]: (prev[cat] ?? []).filter((_, i) => i !== idx) }))
    markDirty()
  }
  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    if (customByCategory[name]) { toast.error('Essa categoria já existe'); return }
    setCustomByCategory(prev => ({ ...prev, [name]: [] }))
    setNewCategoryName('')
    setShowAddCategory(false)
    markDirty()
  }
  const removeCategory = (cat: string) => {
    if ((customByCategory[cat] ?? []).length > 0) {
      if (!confirm(`Apagar a categoria "${cat}" e as ${customByCategory[cat].length} linhas dentro dela?`)) return
    }
    setCustomByCategory(prev => {
      const next = { ...prev }; delete next[cat]; return next
    })
    markDirty()
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const libraryByCat = {
    comercial: BOUNDARIES_LIBRARY.filter(b => b.category === 'comercial'),
    comunicacao: BOUNDARIES_LIBRARY.filter(b => b.category === 'comunicacao'),
    marca: BOUNDARIES_LIBRARY.filter(b => b.category === 'marca'),
    comportamento: BOUNDARIES_LIBRARY.filter(b => b.category === 'comportamento'),
  }

  // Garante que categorias default apareçam mesmo vazias
  const allCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...Object.keys(customByCategory),
  ]))

  return (
    <div className="space-y-6">
      {/* Biblioteca prontos */}
      <div>
        <h4 className="text-sm font-medium text-slate-900 mb-1">Biblioteca de linhas vermelhas</h4>
        <p className="text-xs text-slate-500 mb-3">Marque as que se aplicam a esse agente:</p>
        {Object.entries(libraryByCat).map(([cat, items]) => (
          <div key={cat} className="mb-4">
            <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{cat}</h5>
            <div className="space-y-1">
              {items.map(b => (
                <label key={b.id} className={cn('flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors',
                  active.includes(b.id) ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200 hover:border-slate-300')}>
                  <input type="checkbox" checked={active.includes(b.id)} onChange={() => toggle(b.id)} className="mt-0.5" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-900">{b.label}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{b.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Personalizadas — agora por categoria editável */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-slate-900">Personalizadas</h4>
            <p className="text-xs text-slate-500 mt-0.5">Suas próprias regras, organizadas em categorias.</p>
          </div>
          {!showAddCategory && (
            <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)} className="gap-1.5">
              <FolderPlus className="w-3.5 h-3.5" /> Nova categoria
            </Button>
          )}
        </div>

        {showAddCategory && (
          <div className="flex gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
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
            const items = customByCategory[cat] ?? []
            const isCustomCat = !DEFAULT_CATEGORIES.includes(cat)
            return (
              <div key={cat} className="border border-slate-200 rounded-lg bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
                  <h5 className="text-xs font-medium text-slate-700 uppercase tracking-wide">{cat}</h5>
                  <div className="flex items-center gap-2">
                    <SuggestVariationsButton
                      text=""
                      fieldType="red_line"
                      context={{ agent_nome: agentName, company_name: companyName, related_moment_label: cat }}
                      onSelect={(t) => {
                        setCustomByCategory(prev => ({ ...prev, [cat]: [...(prev[cat] ?? []), t] }))
                        markDirty()
                      }}
                      label="Sugerir"
                    />
                    {isCustomCat && (
                      <button onClick={() => removeCategory(cat)} className="text-slate-400 hover:text-red-600"
                        title="Apagar categoria">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">(nenhuma personalizada nesta categoria)</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((c, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md border bg-rose-50 border-rose-100 text-rose-700 inline-flex items-center gap-1.5">
                          {c}
                          <button onClick={() => removeItem(cat, i)}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
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
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}
