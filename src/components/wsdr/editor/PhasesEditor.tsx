import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { type SofiaPhase } from '@/components/wsdr/sofiaConfig'
import { SortableList } from '@/components/wsdr/editor/SortableList'

// CRUD do "Roteiro" da conversa (as fases): a espinha proativa. O dono explica, em ordem,
// COMO a Sofia conduz cada etapa. Reordenar é arrastando. Vira o bloco <fluxo_de_fases>.
export function PhasesEditor({ phases, onChange }: { phases: SofiaPhase[]; onChange: (p: SofiaPhase[]) => void }) {
  const set = (i: number, patch: Partial<SofiaPhase>) =>
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = () => onChange([...phases, { nome: '', objetivo: '', avancar_quando: '' }])
  const remove = (i: number) => onChange(phases.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A ordem em que a Sofia conduz a conversa. Em cada etapa, explique o que ela faz e o ritmo. Ela segue na ordem e só avança quando a etapa é cumprida. <strong>Arraste pela alça</strong> pra reordenar.
      </p>
      <SortableList
        items={phases}
        onReorder={onChange}
        renderItem={(p, i) => (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-white">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-700 text-xs font-bold shrink-0">{i + 1}</span>
              <Input value={p.nome} onChange={e => set(i, { nome: e.target.value })} placeholder="Nome da etapa (ex: Apresentação)" className="flex-1" />
              <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">O que a Sofia faz nesta etapa (e o ritmo)</label>
              <Textarea value={p.objetivo} onChange={e => set(i, { objetivo: e.target.value })} placeholder="Ex: Só se apresente de leve, faça uma pergunta e espere a resposta. Não despeje tudo de uma vez." className="min-h-[64px]" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Avançar pra próxima etapa quando…</label>
              <Input value={p.avancar_quando} onChange={e => set(i, { avancar_quando: e.target.value })} placeholder="Ex: o casal responder e você souber o nome" />
            </div>
          </div>
        )}
      />
      {phases.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhuma etapa ainda. Sem etapas, a Sofia conduz no modo livre.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar etapa
      </button>
    </div>
  )
}
