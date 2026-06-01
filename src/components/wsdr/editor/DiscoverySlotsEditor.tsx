import { Plus, Trash2, ChevronUp, ChevronDown, Eye } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { StringListEditor } from '@/components/wsdr/StringListEditor'
import { type DiscoverySlot, type SlotPriority, SLOT_PRIORITY_OPTIONS } from '@/components/wsdr/sofiaConfig'

const TONE: Record<string, { chip: string; dot: string }> = {
  rose: { chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  amber: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  slate: { chip: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
}

// Campos do CRM Weddings que um slot pode alimentar (leigo escolhe da lista).
const CRM_FIELDS: { value: string | null; label: string }[] = [
  { value: null, label: 'Nenhum (só pergunta)' },
  { value: 'ww_destino', label: 'Destino' },
  { value: 'ww_num_convidados', label: 'Nº de convidados' },
  { value: 'ww_orcamento_faixa', label: 'Orçamento do casal' },
  { value: 'ww_data_casamento', label: 'Data do casamento' },
  { value: 'ww_nome_parceiro', label: 'Nome do parceiro(a)' },
  { value: 'ww_tipo_casamento', label: 'Tipo de casamento' },
]

let keySeq = 0
const newKey = () => `slot_${Date.now().toString(36)}_${keySeq++}`

// Sondagem: cada slot é um DADO que a Sofia coleta, com prioridade + perguntas opcionais.
// Vira o conteúdo de <o_que_entender>/sondagem no cérebro (não muda a lógica de decisão).
export function DiscoverySlotsEditor({ slots, onChange }: { slots: DiscoverySlot[]; onChange: (s: DiscoverySlot[]) => void }) {
  const set = (i: number, patch: Partial<DiscoverySlot>) =>
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const add = () => onChange([...slots, { key: newKey(), label: '', priority: 'preferred', questions: [], crm_field_key: null }])
  const remove = (i: number) => onChange(slots.filter((_, idx) => idx !== i))
  const move = (i: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= slots.length) return
    const next = [...slots]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        O que a Sofia descobre na conversa. <strong>Crítica</strong> bloqueia o convite até preencher; <strong>importante</strong> ela pergunta enquanto qualifica; <strong>extra</strong> só se a conversa fluir. Sem pergunta escrita, ela improvisa.
      </p>
      {slots.map((s, i) => {
        const prioOpt = SLOT_PRIORITY_OPTIONS.find(o => o.value === s.priority) || SLOT_PRIORITY_OPTIONS[1]
        return (
          <div key={s.key} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-white">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', TONE[prioOpt.tone]?.dot)} />
              <Input value={s.label} onChange={e => set(i, { label: e.target.value })} placeholder="Ex: Destino ou região" className="flex-1" />
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronUp className="w-3 h-3 text-slate-400" /></button>
                <button type="button" onClick={() => move(i, 'down')} disabled={i === slots.length - 1} className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30"><ChevronDown className="w-3 h-3 text-slate-400" /></button>
              </div>
              <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SLOT_PRIORITY_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set(i, { priority: o.value as SlotPriority })}
                  title={o.hint}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    s.priority === o.value ? TONE[o.tone]?.chip : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Perguntas que a Sofia pode fazer (vazio = ela improvisa)</label>
              <StringListEditor items={s.questions} onChange={questions => set(i, { questions })} placeholder="Ex: Vocês já têm um destino no coração?" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Campo do CRM (opcional)</label>
                <select
                  value={s.crm_field_key ?? ''}
                  onChange={e => set(i, { crm_field_key: e.target.value || null })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CRM_FIELDS.map(f => <option key={f.value ?? 'none'} value={f.value ?? ''}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Precisão necessária (opcional)</label>
                <Input value={s.coverage_notes ?? ''} onChange={e => set(i, { coverage_notes: e.target.value })} placeholder="Ex: data precisa de mês e ano" />
              </div>
            </div>
          </div>
        )
      })}
      {slots.length === 0 && (
        <p className="text-xs text-slate-400 italic py-1">Nenhum dado de sondagem. A Sofia vai usar os critérios como base.</p>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar dado pra coletar
      </button>

      <div className="flex items-start gap-2 text-[11px] text-slate-400 pt-1">
        <Eye className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>A Sofia também observa sinais sem perguntar (família ajudando, hesitação por valor, destino indefinido). Esses alimentam os momentos e a pontuação.</span>
      </div>
    </div>
  )
}
