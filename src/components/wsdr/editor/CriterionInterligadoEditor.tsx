import { Plus, Trash2, Target, MessageCircleQuestion, Star } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { SortableList } from './SortableList'
import {
  type QualCriterion, type CriterionKind, type CriterionFaixa, type CriterionOpcao,
  CRITERION_KIND_OPTIONS, DEFAULT_WEIGHT_BY_IMPORTANCIA,
} from '@/components/wsdr/sofiaConfig'

const kindOf = (c: QualCriterion): CriterionKind =>
  c.kind ?? ((c.importancia === 'desqualifica' || c.rule_type === 'disqualifier') ? 'desqualifica' : 'sim_nao')

// Card de CRITÉRIO INTERLIGADO: junta o que descobrir (alvo) + como ela pergunta (opcional;
// vazio = improvisa pelo alvo) + como pontua (tipo) + quando perguntar (sempre/fronteira).
// É a peça central da Qualificação: pergunta, dado e nota deixam de ser separados.
export function CriterionInterligadoEditor({
  criteria, onChange,
}: {
  criteria: QualCriterion[]
  onChange: (c: QualCriterion[]) => void
}) {
  const set = (i: number, patch: Partial<QualCriterion>) =>
    onChange(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => onChange(criteria.filter((_, idx) => idx !== i))
  const add = () =>
    onChange([...criteria, { label: '', importancia: 'media', kind: 'sim_nao', weight: 12, rule_type: 'qualifier', como_perguntar: '', perguntar_quando: 'sempre' }])

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Cada critério é uma coisa só: <strong>o que descobrir</strong>, <strong>como ela pergunta</strong> e <strong>como vira nota</strong>.
        O nome do critério é o alvo — se você não escrever a pergunta, ela formula sozinha a partir dele.
      </p>
      <SortableList
        items={criteria}
        onReorder={onChange}
        renderItem={(c, i) => (
          <CriterionCard c={c} onPatch={(p) => set(i, p)} onRemove={() => remove(i)} />
        )}
      />
      <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
        <Plus className="w-4 h-4" />Adicionar critério
      </button>
    </div>
  )
}

function Zone({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50/70 border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function CriterionCard({ c, onPatch, onRemove }: { c: QualCriterion; onPatch: (p: Partial<QualCriterion>) => void; onRemove: () => void }) {
  const kind = kindOf(c)
  const improvisa = !((c.como_perguntar ?? '').trim())
  const naFronteira = c.perguntar_quando === 'fronteira'
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-2">
        <Input
          value={c.label}
          onChange={e => onPatch({ label: e.target.value })}
          placeholder="Ex: Orçamento do casal (por convidado)"
          className="flex-1 font-medium"
        />
        <button type="button" onClick={onRemove} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500" title="Remover critério">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {/* COMO ELA PERGUNTA */}
        <Zone icon={<MessageCircleQuestion className="w-3.5 h-3.5" />} title="Como ela pergunta">
          {kind === 'desqualifica' ? (
            <p className="text-xs text-slate-500">A Sofia não pergunta isto direto — ela percebe na conversa.</p>
          ) : (
            <>
              <div className="flex gap-1.5 mb-2">
                <Toggle on={improvisa} onClick={() => onPatch({ como_perguntar: '' })} label="Ela improvisa" />
                <Toggle on={!improvisa} onClick={() => onPatch({ como_perguntar: c.como_perguntar || ' ' })} label="Pergunta assim" />
              </div>
              {!improvisa && (
                <textarea
                  value={c.como_perguntar ?? ''}
                  onChange={e => onPatch({ como_perguntar: e.target.value })}
                  placeholder="A pergunta que ela prefere usar (ela ainda reage ao que o casal disse)"
                  rows={2}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                />
              )}
              <label className="flex items-center gap-2 mt-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={naFronteira} onChange={e => onPatch({ perguntar_quando: e.target.checked ? 'fronteira' : 'sempre' })} className="accent-indigo-600" />
                Só pergunta se faltar ponto (aprofundamento)
              </label>
            </>
          )}
        </Zone>

        {/* COMO PONTUA */}
        <Zone icon={<Star className="w-3.5 h-3.5" />} title="Como pontua">
          <select
            value={kind}
            onChange={e => onPatch({ kind: e.target.value as CriterionKind, rule_type: e.target.value === 'desqualifica' ? 'disqualifier' : 'qualifier' })}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {CRITERION_KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mb-2">{CRITERION_KIND_OPTIONS.find(o => o.value === kind)?.hint}</p>

          {kind === 'sim_nao' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Vale</span>
              <Input type="number" value={c.weight ?? DEFAULT_WEIGHT_BY_IMPORTANCIA[c.importancia]} onChange={e => onPatch({ weight: Number(e.target.value) })} className="w-20 text-center" />
              <span className="text-xs text-slate-500">pontos</span>
            </div>
          )}
          {kind === 'faixas_valor' && <FaixasEditor c={c} onPatch={onPatch} />}
          {kind === 'peso_por_opcao' && <OpcoesEditor c={c} onPatch={onPatch} />}
          {kind === 'desqualifica' && <p className="text-xs text-rose-600">Se aparecer, a nota vai a zero na hora.</p>}
        </Zone>
      </div>
      <p className="text-[11px] text-slate-400 flex items-center gap-1"><Target className="w-3 h-3" /> Alvo: <span className="text-slate-500">{c.label || '(dê um nome ao critério)'}</span>{c.crm_field_key ? ` · ficha: ${c.crm_field_key}` : ''}</p>
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors', on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300')}>
      {label}
    </button>
  )
}

// Faixas de valor (ex: R$ por convidado → pontos).
function FaixasEditor({ c, onPatch }: { c: QualCriterion; onPatch: (p: Partial<QualCriterion>) => void }) {
  const faixas = c.faixas ?? []
  const setF = (i: number, patch: Partial<CriterionFaixa>) => onPatch({ faixas: faixas.map((f, idx) => idx === i ? { ...f, ...patch } : f) })
  const num = (v: string): number | null => v.trim() === '' ? null : Number(v)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Base:</span>
        <select value={c.base ?? 'por_convidado'} onChange={e => onPatch({ base: e.target.value as 'por_convidado' | 'total' })} className="border border-slate-300 rounded px-2 py-1 text-xs">
          <option value="por_convidado">R$ por convidado</option>
          <option value="total">Orçamento total</option>
        </select>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center text-[11px] text-slate-400 px-0.5">
        <span>de (R$)</span><span>até (R$)</span><span>pts</span><span></span>
      </div>
      {faixas.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center">
          <Input value={f.de ?? ''} onChange={e => setF(i, { de: num(e.target.value) })} placeholder="—" className="text-center text-xs h-8" />
          <Input value={f.ate ?? ''} onChange={e => setF(i, { ate: num(e.target.value) })} placeholder="∞" className="text-center text-xs h-8" />
          <Input type="number" value={f.pontos} onChange={e => setF(i, { pontos: Number(e.target.value) })} className="w-14 text-center text-xs h-8" />
          <button type="button" onClick={() => onPatch({ faixas: faixas.filter((_, idx) => idx !== i) })} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onPatch({ faixas: [...faixas, { de: null, ate: null, pontos: 0 }] })} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Plus className="w-3 h-3" />faixa</button>
    </div>
  )
}

// Peso por opção (ex: destino → pontos).
function OpcoesEditor({ c, onPatch }: { c: QualCriterion; onPatch: (p: Partial<QualCriterion>) => void }) {
  const opcoes = c.opcoes ?? []
  const setO = (i: number, patch: Partial<CriterionOpcao>) => onPatch({ opcoes: opcoes.map((o, idx) => idx === i ? { ...o, ...patch } : o) })
  return (
    <div className="space-y-1.5">
      {opcoes.map((o, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
          <Input value={o.opcao} onChange={e => setO(i, { opcao: e.target.value })} placeholder="Ex: Caribe" className="text-xs h-8" />
          <Input type="number" value={o.pontos} onChange={e => setO(i, { pontos: Number(e.target.value) })} className="w-14 text-center text-xs h-8" />
          <button type="button" onClick={() => onPatch({ opcoes: opcoes.filter((_, idx) => idx !== i) })} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onPatch({ opcoes: [...opcoes, { opcao: '', pontos: 0 }] })} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Plus className="w-3 h-3" />opção</button>
      <label className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
        Fora da lista:
        <select value={c.fora_da_lista ?? 'zero'} onChange={e => onPatch({ fora_da_lista: e.target.value as 'zero' | 'desqualifica' })} className="border border-slate-300 rounded px-1.5 py-0.5 text-[11px]">
          <option value="zero">0 pontos</option>
          <option value="desqualifica">desqualifica</option>
        </select>
      </label>
    </div>
  )
}
