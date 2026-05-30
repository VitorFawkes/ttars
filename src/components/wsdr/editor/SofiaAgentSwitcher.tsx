import { useState } from 'react'
import { Plus, Bot, Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useSofiaAgents } from '@/hooks/wsdr/useSofiaAgents'

interface Props {
  selectedSlug: string
  onSelect: (slug: string) => void
}

export function SofiaAgentSwitcher({ selectedSlug, onSelect }: Props) {
  const { agents, loading, creating, spawn } = useSofiaAgents()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const slug = await spawn(trimmed)
    if (slug) {
      setName('')
      setAdding(false)
      onSelect(slug)
    }
  }

  if (loading && agents.length === 0) {
    return <div className="h-10 w-full bg-slate-100 rounded-lg animate-pulse" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-400 px-1">Agente:</span>
        {agents.map(a => {
          const active = a.slug === selectedSlug
          return (
            <button key={a.slug} type="button" onClick={() => onSelect(a.slug)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300')}>
              <Bot className="w-3.5 h-3.5" />{a.display_name}
            </button>
          )
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
            <Plus className="w-3.5 h-3.5" />Novo agente
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <Input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="Nome do novo agente (ex: Helena)" className="flex-1" />
          <Button type="button" onClick={handleCreate} disabled={creating || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar a partir da Sofia'}
          </Button>
          <button type="button" onClick={() => { setAdding(false); setName('') }} className="p-1.5 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {adding && <p className="text-xs text-slate-400 mt-2 px-1">O novo agente nasce com tudo da Sofia (você muda as diretrizes depois). Fica isolado neste workspace.</p>}
    </div>
  )
}
