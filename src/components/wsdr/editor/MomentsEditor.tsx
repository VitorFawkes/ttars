import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { type SofiaMoment, type MomentTrigger, MOMENT_TRIGGERS } from '@/components/wsdr/sofiaConfig'
import { SortableList } from '@/components/wsdr/editor/SortableList'

// CRUD dos "momentos": é aqui que o leigo faz a Sofia falar/agir de um jeito específico
// num momento específico (ex: quando perguntam preço, quando citam família). Cada momento
// tem um gatilho (escolhido de uma lista, com exemplo) + a instrução em linguagem simples.
// Vira o bloco <momentos> do cérebro. Anti-controle-falso: a instrução chega ao prompt.
// Quando o gatilho é "condição que eu descrevo", aparece um campo extra pra descrever quando.
export function MomentsEditor({ moments, onChange }: { moments: SofiaMoment[]; onChange: (m: SofiaMoment[]) => void }) {
  const set = (i: number, patch: Partial<SofiaMoment>) =>
    onChange(moments.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  const add = () => onChange([...moments, { label: '', instrucao: '', trigger_type: 'custom_condition', enabled: true }])
  const remove = (i: number) => onChange(moments.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Faça a Sofia falar ou agir de um jeito específico num momento específico. Escolha quando acontece e escreva o que ela deve fazer. <strong>Arraste pela alça</strong> pra reordenar.
      </p>
      <SortableList
        items={moments}
        onReorder={onChange}
        renderItem={(m, i) => {
          const trig = MOMENT_TRIGGERS.find(t => t.value === m.trigger_type) || MOMENT_TRIGGERS[MOMENT_TRIGGERS.length - 1]
          return (
            <div className="border border-ww-sand rounded-xl p-3 space-y-2.5 bg-white">
              {/* O gatilho É o título do momento (não há campo "nome" — ele não ia pro prompt). */}
              <div className="flex items-center gap-2">
                <select
                  value={m.trigger_type}
                  onChange={e => set(i, { trigger_type: e.target.value as MomentTrigger })}
                  aria-label="Quando acontece"
                  className="flex-1 min-w-0 text-sm font-medium border border-ww-sand rounded-lg px-2.5 py-2 bg-white text-ww-n700 focus:outline-none focus:ring-2 focus:ring-ww-gold/40"
                >
                  {MOMENT_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-ww-n500 shrink-0">
                  {m.enabled ? 'Ativo' : 'Inativo'}
                  <Switch checked={m.enabled} onCheckedChange={v => set(i, { enabled: v })} className={m.enabled ? 'bg-ww-gold' : ''} />
                </label>
                <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-ww-n400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              {trig.exemplo && <p className="text-[11px] text-ww-n400 -mt-1">Dispara, por ex., em: {trig.exemplo}</p>}
              {m.trigger_type === 'custom_condition' && (
                <div>
                  <label className="block text-xs text-ww-n500 mb-1">Descreva quando isso acontece</label>
                  <Input value={m.custom_condition_description ?? ''} onChange={e => set(i, { custom_condition_description: e.target.value })} placeholder="Ex: quando o casal menciona um resort all-inclusive" />
                </div>
              )}
              <div>
                <label className="block text-xs text-ww-n500 mb-1">O que a Sofia faz nesse momento</label>
                <Textarea value={m.instrucao} onChange={e => set(i, { instrucao: e.target.value })} placeholder="Ex: fale da assessoria com leveza e remeta os detalhes à Wedding Planner" className="min-h-[72px]" />
              </div>
            </div>
          )
        }}
      />
      {moments.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhum momento ainda.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-ww-gold-ink hover:text-ww-gold">
        <Plus className="w-4 h-4" />Adicionar momento
      </button>
    </div>
  )
}
