import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { type SofiaMoment, type MomentTrigger, MOMENT_TRIGGERS } from '@/components/wsdr/sofiaConfig'

// CRUD dos "momentos": é aqui que o leigo faz a Sofia falar/agir de um jeito específico
// num momento específico (ex: quando perguntam preço, quando citam família). Cada momento
// tem um gatilho (escolhido de uma lista, com exemplo) + a instrução em linguagem simples.
// Vira o bloco <momentos> do cérebro. Anti-controle-falso: a instrução chega ao prompt.
export function MomentsEditor({ moments, onChange }: { moments: SofiaMoment[]; onChange: (m: SofiaMoment[]) => void }) {
  const set = (i: number, patch: Partial<SofiaMoment>) =>
    onChange(moments.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const add = () => onChange([...moments, { label: '', instrucao: '', trigger_type: 'custom_condition', enabled: true }])
  const remove = (i: number) => onChange(moments.filter((_, idx) => idx !== i))
  const move = (i: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= moments.length) return
    const next = [...moments]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Faça a Sofia falar ou agir de um jeito específico num momento específico. Escolha quando acontece e escreva o que ela deve fazer.
      </p>
      {moments.map((m, i) => {
        const trig = MOMENT_TRIGGERS.find(t => t.value === m.trigger_type) || MOMENT_TRIGGERS[MOMENT_TRIGGERS.length - 1]
        return (
          <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2.5 bg-white">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronUp className="w-3 h-3 text-slate-400" /></button>
                <button type="button" onClick={() => move(i, 'down')} disabled={i === moments.length - 1} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronDown className="w-3 h-3 text-slate-400" /></button>
              </div>
              <Input value={m.label} onChange={e => set(i, { label: e.target.value })} placeholder="Nome do momento (ex: Quando perguntam preço)" className="flex-1" />
              <label className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                {m.enabled ? 'Ativo' : 'Inativo'}
                <Switch checked={m.enabled} onCheckedChange={v => set(i, { enabled: v })} className={m.enabled ? 'bg-indigo-600' : ''} />
              </label>
              <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Quando acontece</label>
              <select
                value={m.trigger_type}
                onChange={e => set(i, { trigger_type: e.target.value as MomentTrigger })}
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {MOMENT_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">{trig.exemplo}</p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">O que a Sofia faz nesse momento</label>
              <Textarea value={m.instrucao} onChange={e => set(i, { instrucao: e.target.value })} placeholder="Ex: fale da assessoria com leveza e remeta os detalhes à Wedding Planner" className="min-h-[72px]" />
            </div>
          </div>
        )
      })}
      {moments.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhum momento ainda.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar momento
      </button>
    </div>
  )
}
