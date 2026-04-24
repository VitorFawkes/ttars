import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X } from 'lucide-react'
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

export function BoundariesSection({ agentId, agentName, companyName }: Props) {
  const { boundaries, isLoading, save } = useAgentBoundaries(agentId)
  const [active, setActive] = useState<string[]>([])
  const [custom, setCustom] = useState<string[]>([])
  const [newCustom, setNewCustom] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setActive(boundaries?.library_active ?? [])
    setCustom(boundaries?.custom ?? [])
    setDirty(false)
  }, [boundaries?.library_active, boundaries?.custom])

  const markDirty = () => setDirty(true)
  const toggle = (id: string) => {
    if (active.includes(id)) setActive(active.filter(x => x !== id))
    else setActive([...active, id])
    markDirty()
  }

  const handleSave = async () => {
    const config: BoundariesConfig = { library_active: active, custom }
    try { await save.mutateAsync(config); toast.success('Linhas vermelhas salvas'); setDirty(false) }
    catch (err) { console.error(err); toast.error('Não consegui salvar.') }
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  const byCategory = {
    comercial: BOUNDARIES_LIBRARY.filter(b => b.category === 'comercial'),
    comunicacao: BOUNDARIES_LIBRARY.filter(b => b.category === 'comunicacao'),
    marca: BOUNDARIES_LIBRARY.filter(b => b.category === 'marca'),
    comportamento: BOUNDARIES_LIBRARY.filter(b => b.category === 'comportamento'),
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-600 mb-3">Marque as linhas vermelhas padrão que se aplicam a esse agente:</p>
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat} className="mb-4">
            <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{cat}</h4>
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Personalizadas</label>
          <SuggestVariationsButton
            text=""
            fieldType="red_line"
            context={{ agent_nome: agentName, company_name: companyName }}
            onSelect={(t) => { setCustom([...custom, t]); markDirty() }}
            label="Sugerir +"
          />
        </div>
        {custom.length === 0 ? (
          <p className="text-xs text-slate-400 italic">(nenhuma)</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {custom.map((c, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md border bg-rose-50 border-rose-100 text-rose-700 inline-flex items-center gap-1.5">
                {c}
                <button onClick={() => { setCustom(custom.filter((_, j) => j !== i)); markDirty() }}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <input value={newCustom} onChange={(e) => setNewCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCustom.trim()) { setCustom([...custom, newCustom.trim()]); setNewCustom(''); markDirty() } } }}
            placeholder="Ex: Nunca usa emoji na primeira mensagem"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <Button size="sm" variant="outline" onClick={() => { if (newCustom.trim()) { setCustom([...custom, newCustom.trim()]); setNewCustom(''); markDirty() } }} className="gap-1">
            <Plus className="w-3.5 h-3.5" />
          </Button>
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
