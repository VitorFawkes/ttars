import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { type SofiaPhase } from '@/components/wsdr/sofiaConfig'

// CRUD das "fases da conversa": a espinha dorsal proativa. Aqui o dono explica, em
// ordem, COMO a Sofia deve conduzir cada etapa (ex: "Apresentação: só se apresente
// e espere a resposta"). A Sofia sabe em qual fase está e segue o ritmo definido.
// Vira o bloco <fluxo_de_fases> do cérebro. É diferente dos "momentos" (reações).
export function PhasesEditor({ phases, onChange }: { phases: SofiaPhase[]; onChange: (p: SofiaPhase[]) => void }) {
  const set = (i: number, patch: Partial<SofiaPhase>) =>
    onChange(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = () => onChange([...phases, { nome: '', objetivo: '', avancar_quando: '' }])
  const remove = (i: number) => onChange(phases.filter((_, idx) => idx !== i))
  const move = (i: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= phases.length) return
    const next = [...phases]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A ordem em que a Sofia conduz a conversa. Em cada fase, explique o que ela deve fazer e o ritmo (ex: "só se apresente e espere a resposta"). Ela segue na ordem e só avança quando a fase é cumprida.
      </p>
      {phases.map((p, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-white">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 text-amber-700 text-xs font-bold shrink-0">{i + 1}</span>
            <Input value={p.nome} onChange={e => set(i, { nome: e.target.value })} placeholder="Nome da fase (ex: Apresentação)" className="flex-1" />
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronUp className="w-3 h-3 text-slate-400" /></button>
              <button type="button" onClick={() => move(i, 'down')} disabled={i === phases.length - 1} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronDown className="w-3 h-3 text-slate-400" /></button>
            </div>
            <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">O que a Sofia faz nesta fase (e o ritmo)</label>
            <Textarea value={p.objetivo} onChange={e => set(i, { objetivo: e.target.value })} placeholder="Ex: Só se apresente de leve, faça uma pergunta e espere a resposta. Não despeje tudo de uma vez." className="min-h-[64px]" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Avançar pra próxima fase quando…</label>
            <Input value={p.avancar_quando} onChange={e => set(i, { avancar_quando: e.target.value })} placeholder="Ex: o casal responder e você souber o nome" />
          </div>
        </div>
      ))}
      {phases.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhuma fase ainda. Sem fases, a Sofia conduz no modo livre.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar fase
      </button>
    </div>
  )
}
