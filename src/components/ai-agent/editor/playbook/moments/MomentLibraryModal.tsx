import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAgentMoments } from '@/hooks/playbook/useAgentMoments'
import { getMomentsByVertical, type LibraryMoment } from '@/lib/playbook/momentsLibrary'

interface Props {
  agentId: string
  existingKeys: string[]
  nextDisplayOrder: number
  onClose: () => void
}

export function MomentLibraryModal({ agentId, existingKeys, nextDisplayOrder, onClose }: Props) {
  const [filter, setFilter] = useState<'all' | 'sales' | 'support' | 'generic'>('all')
  const { upsert } = useAgentMoments(agentId)
  const library = getMomentsByVertical(filter)

  const handleAdd = async (item: LibraryMoment) => {
    const s = item.suggested
    try {
      await upsert.mutateAsync({
        moment_key: s.moment_key,
        moment_label: s.moment_label,
        display_order: nextDisplayOrder,
        trigger_type: s.trigger_type,
        trigger_config: s.trigger_config ?? {},
        message_mode: s.message_mode,
        anchor_text: s.anchor_text ?? null,
        red_lines: s.red_lines ?? [],
        collects_fields: [],
        enabled: true,
      })
      toast.success(`Momento "${s.moment_label}" adicionado`)
      onClose()
    } catch (err) {
      console.error(err); toast.error('Não consegui adicionar. Talvez o slug já exista.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-medium text-slate-900">Biblioteca de momentos</h3>
            <p className="text-xs text-slate-500 mt-0.5">Clique pra adicionar. Pode editar depois.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </header>

        <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5">
          {[
            { v: 'all' as const, l: 'Todos' },
            { v: 'sales' as const, l: 'Vendas' },
            { v: 'support' as const, l: 'Suporte' },
            { v: 'generic' as const, l: 'Genéricos' },
          ].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)}
              className={cn('text-xs px-2.5 py-1 rounded-full border', filter === f.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200')}>
              {f.l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {library.map(item => {
            const alreadyExists = existingKeys.includes(item.suggested.moment_key)
            return (
              <div key={item.key} className={cn('border rounded-lg p-3', alreadyExists ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-indigo-300')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-slate-900">{item.label}</h4>
                    <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                  </div>
                  {alreadyExists ? (
                    <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> já tem</span>
                  ) : (
                    <Button size="sm" onClick={() => handleAdd(item)} disabled={upsert.isPending}>Adicionar</Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </footer>
      </div>
    </div>
  )
}
