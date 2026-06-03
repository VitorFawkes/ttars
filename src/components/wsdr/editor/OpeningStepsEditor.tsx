import { Plus, Trash2, Pause, ArrowDown } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { SortableList } from './SortableList'
import type { OpeningStep } from '@/components/wsdr/sofiaConfig'

// Abertura em PASSOS: cada passo = uma fala + se ela ESPERA a resposta + o que CAPTURA ali.
// Você arrasta, adiciona, escolhe onde ela pausa e o que coleta (nome hoje, outra coisa amanhã).
export function OpeningStepsEditor({
  steps, onChange,
}: {
  steps: OpeningStep[]
  onChange: (s: OpeningStep[]) => void
}) {
  const set = (i: number, patch: Partial<OpeningStep>) =>
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const remove = (i: number) => onChange(steps.filter((_, idx) => idx !== i))
  const add = () => onChange([...steps, { fala: '', espera_resposta: true, captura: null }])

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 leading-relaxed">
        A abertura acontece em passos, na ordem. Nos passos marcados <strong>“espera a resposta”</strong>, a Sofia pausa e aguarda o casal antes de seguir. Ela sempre reage ao que disseram.
      </p>
      <SortableList
        items={steps}
        onReorder={onChange}
        renderItem={(s, i) => (
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 w-6 h-6 shrink-0 rounded-full bg-ww-gold-soft text-ww-gold-ink text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <div className="flex-1 space-y-2">
                <textarea
                  value={s.fala}
                  onChange={e => set(i, { fala: e.target.value })}
                  placeholder="O que ela diz neste passo (ex: cumprimenta e pergunta o nome)"
                  rows={2}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ww-gold/40 resize-y"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={s.espera_resposta} onChange={e => set(i, { espera_resposta: e.target.checked })} className="accent-ww-gold" />
                    {s.espera_resposta ? <Pause className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-400" />}
                    {s.espera_resposta ? 'Espera a resposta' : 'Emenda no próximo'}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Captura:
                    <Input value={s.captura ?? ''} onChange={e => set(i, { captura: e.target.value || null })} placeholder="ex: nome (opcional)" className="h-7 w-40 text-xs" />
                  </label>
                </div>
              </div>
              <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500" title="Remover passo">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      />
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-ww-gold-ink hover:text-ww-gold">
        <Plus className="w-4 h-4" />Adicionar passo
      </button>
    </div>
  )
}
