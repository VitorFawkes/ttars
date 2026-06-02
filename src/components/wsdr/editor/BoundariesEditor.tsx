import { useState } from 'react'
import { AlertTriangle, ShieldCheck, Trash2, Plus } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Field } from '@/components/wsdr/editor/ui/primitives'
import { SortableList } from '@/components/wsdr/editor/SortableList'
import { type SofiaConfigV2, type SofiaRule, type EscalationConfig, buildRegrasFromLegacy } from '@/components/wsdr/sofiaConfig'

type Boundaries = SofiaConfigV2['boundaries']

// Lista ÚNICA e editável de regras de conduta: edita o texto, liga/desliga, adiciona e remove.
// As "de fábrica" (com id) têm fiação especial (ex: travessão liga a trava automática) e mostram
// aviso ao desligar se protegem qualidade. Tudo editável (controle total).
export function BoundariesEditor({ boundaries, onChange }: { boundaries: Boundaries; onChange: (b: Boundaries) => void }) {
  const regras: SofiaRule[] = boundaries.regras && boundaries.regras.length
    ? boundaries.regras
    : buildRegrasFromLegacy(boundaries.curadas || {}, boundaries.comportamentos || [])
  const escalation: EscalationConfig = boundaries.escalation ?? { enabled: false, max_turns: 12, message: '' }
  const [novo, setNovo] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')

  const setRegras = (next: SofiaRule[]) => onChange({ ...boundaries, regras: next })
  const patch = (i: number, p: Partial<SofiaRule>) => setRegras(regras.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  const remove = (i: number) => setRegras(regras.filter((_, idx) => idx !== i))
  const add = () => { if (novo.trim()) { setRegras([...regras, { texto: novo.trim(), ativa: true, protege: false }]); setNovo('') } }
  const setEsc = (p: Partial<EscalationConfig>) => onChange({ ...boundaries, escalation: { ...escalation, ...p } })

  const renderRow = (r: SofiaRule, i: number) => {
    const warn = r.protege && !r.ativa
    return (
      <div className={cn('flex items-start justify-between gap-3 p-3 rounded-lg border transition-colors',
        warn ? 'bg-amber-50/70 border-amber-300' : r.ativa ? 'bg-white border-slate-200' : 'bg-slate-50/60 border-slate-200')}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {r.protege && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700"><ShieldCheck className="w-3 h-3" />qualidade</span>}
          </div>
          {editing === i ? (
            <Textarea autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim()) patch(i, { texto: editVal.trim() }); setEditing(null) }}
              onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
              className="min-h-[56px] text-sm" />
          ) : (
            <button type="button" onClick={() => { setEditing(i); setEditVal(r.texto) }}
              className={cn('text-left text-sm leading-relaxed whitespace-pre-wrap break-words hover:text-slate-900', r.ativa ? 'text-slate-800' : 'text-slate-400')}
              title="Clique para editar">
              {r.texto}
            </button>
          )}
          {warn && <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />Desligado: a Sofia pode fazer isso. Costuma reduzir a qualidade, mas a escolha é sua.</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch checked={r.ativa} onCheckedChange={v => patch(i, { ativa: v })} className={r.ativa ? 'bg-rose-600' : ''} />
          <button type="button" onClick={() => remove(i)} className="p-1.5 hover:bg-red-50 rounded text-slate-300 hover:text-red-500" title="Remover regra"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Escreva uma regra nova (ex: nunca prometa fornecedor específico)" className="flex-1" />
        <button type="button" onClick={add} className="shrink-0 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center"><Plus className="w-4 h-4" /></button>
      </div>
      <SortableList items={regras} onReorder={setRegras} renderItem={renderRow} />

      {/* Escalação */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <label className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Chamar uma pessoa se a conversa travar</p>
            <p className="text-xs text-slate-500 mt-0.5">Depois de muitas mensagens sem avançar, a Sofia passa pra um humano.</p>
          </div>
          <Switch checked={escalation.enabled} onCheckedChange={v => setEsc({ enabled: v })} className={escalation.enabled ? 'bg-indigo-600' : ''} />
        </label>
        {escalation.enabled && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <Field label="Máximo de mensagens antes de escalar"><Input type="number" value={escalation.max_turns} onChange={e => setEsc({ max_turns: Number(e.target.value) })} /></Field>
            <Field label="Mensagem ao escalar"><Textarea value={escalation.message} onChange={e => setEsc({ message: e.target.value })} className="min-h-[44px]" placeholder="Ex: Vou chamar a nossa Wedding Planner pra conversar com vocês." /></Field>
          </div>
        )}
      </div>
    </div>
  )
}
