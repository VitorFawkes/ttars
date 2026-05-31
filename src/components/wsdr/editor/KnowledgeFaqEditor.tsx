import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'

export interface Faq { q: string; a: string }

export function KnowledgeFaqEditor({ faqs, onChange }: { faqs: Faq[]; onChange: (f: Faq[]) => void }) {
  const set = (i: number, patch: Partial<Faq>) => onChange(faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const add = () => onChange([...faqs, { q: '', a: '' }])
  const remove = (i: number) => onChange(faqs.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      {faqs.length === 0 && <p className="text-xs text-slate-400 italic">Nenhuma pergunta cadastrada ainda.</p>}
      {faqs.map((f, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pergunta {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <Input value={f.q} onChange={e => set(i, { q: e.target.value })} placeholder="O que o casal costuma perguntar?" />
          <Textarea value={f.a} onChange={e => set(i, { a: e.target.value })} placeholder="Como a Sofia deve responder" className="min-h-[60px]" />
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar pergunta
      </button>
    </div>
  )
}
