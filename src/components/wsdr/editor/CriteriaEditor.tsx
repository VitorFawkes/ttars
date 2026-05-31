import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { type QualCriterion, type Importancia, IMPORTANCIA_OPTIONS } from '@/components/wsdr/sofiaConfig'

const COLOR_CHIP: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
}

// CRUD dos critérios que a Sofia usa pra dar a NOTA do casal (0-100). O leigo escreve
// o critério em linguagem simples e escolhe a importância; a IA (Qualificador) julga
// o fit a partir disso. Não é planilha de pesos — é critério + importância.
export function CriteriaEditor({ criteria, onChange }: { criteria: QualCriterion[]; onChange: (c: QualCriterion[]) => void }) {
  const set = (i: number, patch: Partial<QualCriterion>) =>
    onChange(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const add = () => onChange([...criteria, { label: '', importancia: 'media' }])
  const remove = (i: number) => onChange(criteria.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A Sofia lê estes critérios pra dar uma nota ao casal e decidir o que ainda falta perguntar. Escreva em linguagem simples e diga o quanto cada um pesa.
      </p>
      {criteria.map((c, i) => {
        const opt = IMPORTANCIA_OPTIONS.find(o => o.value === c.importancia) || IMPORTANCIA_OPTIONS[2]
        return (
          <div key={i} className="flex items-start gap-2 p-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex-1 space-y-2">
              <Input
                value={c.label}
                onChange={e => set(i, { label: e.target.value })}
                placeholder="Ex: Tem destino ou região em mente"
              />
              <div className="flex flex-wrap gap-1.5">
                {IMPORTANCIA_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set(i, { importancia: o.value as Importancia })}
                    title={o.hint}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      c.importancia === o.value ? COLOR_CHIP[o.color] : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">{opt.hint}</p>
            </div>
            <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500" title="Remover critério">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      })}
      {criteria.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhum critério ainda. A Sofia vai usar as etapas como base.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar critério
      </button>
    </div>
  )
}
