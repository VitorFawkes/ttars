import { useState } from 'react'
import { Megaphone, Users, ExternalLink, StickyNote, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJ_FIELD } from '../../hooks/planejamento/types'

const FIELD = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'
const LBL = 'text-[10.5px] uppercase tracking-[0.08em] text-slate-500 font-bold'
const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]'

function readStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : '') : String(v)
}

function TextField({
  label, value, type = 'text', placeholder, onSave,
}: { label: string; value: string; type?: string; placeholder?: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  return (
    <label className="block">
      <span className={LBL}>{label}</span>
      <input
        type={type}
        value={local}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local.trim()) }}
        className={cn(FIELD, 'mt-1')}
      />
    </label>
  )
}

function BoolField({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1.5">
      <button
        type="button"
        onClick={() => onToggle(!checked)}
        className={cn(
          'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
          checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400',
        )}
        aria-pressed={checked}
      >
        {checked && <Check className="w-3.5 h-3.5" />}
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  )
}

// ── Notas da planejadora (texto livre — contexto do casamento) ──────────────
// (Reuniões agora são TAREFAS na espinha; aqui fica só a nota livre.)
export function NotasSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  return (
    <section className={cn(CARD, 'h-full')}>
      <header className="flex items-center gap-2 mb-3">
        <StickyNote className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Notas da planejadora</h2>
      </header>
      <textarea
        defaultValue={readStr(pd, PLANEJ_FIELD.notas)}
        rows={4}
        placeholder="Contexto, combinados, preferências e pendências do casal…"
        onBlur={(e) => set(PLANEJ_FIELD.notas, e.target.value.trim())}
        className={cn(FIELD, 'w-full')}
      />
    </section>
  )
}

// ── Ação Promocional (definição — disparo é em Convidados) ───────────────────
export function AcaoPromoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  return (
    <section className={cn(CARD, 'h-full')}>
      <header className="flex items-center gap-2 mb-3">
        <Megaphone className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Ação promocional (definição)</h2>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField label="Tarifa promocional (R$/noite)" type="number" value={readStr(pd, PLANEJ_FIELD.promoTarifa)} onSave={(v) => set(PLANEJ_FIELD.promoTarifa, v)} />
        <TextField label="Início da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoInicio)} onSave={(v) => set(PLANEJ_FIELD.promoInicio, v)} />
        <TextField label="Fim da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoFim)} onSave={(v) => set(PLANEJ_FIELD.promoFim, v)} />
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5">Aqui só se <b className="text-slate-600">define</b> a promo (tarifa + janela). O nº de quartos a bloquear fica em Local &amp; Hospedagem; o disparo das mensagens é na área de Convidados.</p>
    </section>
  )
}

// ── Convidados (lista, contrato & estimativa — sem confirmação, que é Convidados) ──
export function ConvidadosResumoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado
  const listaPreenchida = readStr(pd, PLANEJ_FIELD.listaPreenchida) === 'true'

  return (
    <section className={cn(CARD, 'h-full')}>
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#BD965C]" />
          <h2 className="text-base font-semibold text-slate-900">Convidados (lista &amp; estimativa)</h2>
        </div>
        <Link to={`/convidados/casamento/${wedding.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline">
          Abrir Convidados <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Contrato (até X pax)" type="number" value={readStr(pd, PLANEJ_FIELD.convidadosContrato)} onSave={(v) => set(PLANEJ_FIELD.convidadosContrato, v)} />
        <TextField label="Pensam em ir (estim.)" type="number" value={readStr(pd, PLANEJ_FIELD.convidadosEstimado)} onSave={(v) => set(PLANEJ_FIELD.convidadosEstimado, v)} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
          <p className={LBL}>Lista preenchida</p>
          <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{listaTotal}</p>
          <p className="text-[11px] text-slate-400">nomes na lista</p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
          <p className={LBL}>Confirmados</p>
          <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{confirmados}</p>
          <p className="text-[11px] text-slate-400">quem confirmou</p>
        </div>
      </div>

      <BoolField label="Lista de convidados preenchida (pronta pro disparo)" checked={listaPreenchida} onToggle={(v) => set(PLANEJ_FIELD.listaPreenchida, v ? true : '')} />

      <p className="text-[11px] text-slate-400 mt-1"><b className="text-slate-600">Confirmação</b> (quem comprou) e a sequência promocional acontecem na área de Convidados.</p>
    </section>
  )
}
