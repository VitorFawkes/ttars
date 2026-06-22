import { useState } from 'react'
import { Landmark, Megaphone, Users, Plus, Trash2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import {
  PLANEJ_FIELD,
  TIPO_LOCAL_LIST,
  TIPO_LOCAL_LABEL,
  ITEM_COMO_OPTIONS,
  type TipoLocal,
  type EspacoItem,
} from '../../hooks/planejamento/types'

const FIELD = 'w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'
const LBL = 'text-[11px] uppercase tracking-wide text-slate-500 font-medium'
const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]'

function readStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : typeof v === 'boolean' ? (v ? 'true' : '') : String(v)
}

function readNum(pd: Record<string, unknown> | null, key: string): number | null {
  const s = readStr(pd, key)
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

function readItens(pd: Record<string, unknown> | null): EspacoItem[] {
  const v = pd?.[PLANEJ_FIELD.itens]
  return Array.isArray(v) ? (v as EspacoItem[]) : []
}

/** Campo de texto/numero/data simples que salva no blur em produto_data. */
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

// ── Espaço & Pacote (substitui a antiga seção de Fornecedores) ──────────────
export function EspacoPacoteSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const tipo = (readStr(pd, PLANEJ_FIELD.tipoLocal) || 'resort_hotel') as TipoLocal
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  const [itens, setItens] = useState<EspacoItem[]>(() => readItens(pd))
  const saveItens = (next: EspacoItem[]) => { setItens(next); save.mutate({ cardId: wedding.id, values: { [PLANEJ_FIELD.itens]: next } }) }
  const updItem = (i: number, patch: Partial<EspacoItem>) => saveItens(itens.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  return (
    <section className={CARD}>
      <header className="flex items-center gap-2 mb-3">
        <Landmark className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Espaço & Pacote do casamento</h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={LBL}>Tipo do local</span>
          <select value={tipo} onChange={(e) => set(PLANEJ_FIELD.tipoLocal, e.target.value)} className={cn(FIELD, 'mt-1')}>
            {TIPO_LOCAL_LIST.map((t) => <option key={t} value={t}>{TIPO_LOCAL_LABEL[t]}</option>)}
          </select>
        </label>
        <TextField label="Espaço / local escolhido" value={readStr(pd, PLANEJ_FIELD.espaco)} placeholder="Ex.: Fasano Trancoso" onSave={(v) => set(PLANEJ_FIELD.espaco, v)} />
      </div>

      {tipo === 'resort_hotel' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <TextField label="Pacote escolhido" value={readStr(pd, PLANEJ_FIELD.pacoteNome)} placeholder="Ex.: Pacote Casamento Praia" onSave={(v) => set(PLANEJ_FIELD.pacoteNome, v)} />
          <TextField label="Valor do pacote (R$)" type="number" value={readStr(pd, PLANEJ_FIELD.pacoteValor)} onSave={(v) => set(PLANEJ_FIELD.pacoteValor, v)} />
          <label className="block sm:col-span-2">
            <span className={LBL}>O que o pacote inclui</span>
            <textarea defaultValue={readStr(pd, PLANEJ_FIELD.pacoteInclui)} rows={2} placeholder="Cerimônia, recepção, jantar, open bar, decoração base…" onBlur={(e) => set(PLANEJ_FIELD.pacoteInclui, e.target.value.trim())} className={cn(FIELD, 'mt-1')} />
          </label>
        </div>
      ) : (
        <label className="block mt-3">
          <span className={LBL}>Regras do local</span>
          <textarea defaultValue={readStr(pd, PLANEJ_FIELD.localRegras)} rows={3} placeholder="Ex.: bebida obrigatória do local; buffet pode ser de fora; locação base; o que é negociável…" onBlur={(e) => set(PLANEJ_FIELD.localRegras, e.target.value.trim())} className={cn(FIELD, 'mt-1')} />
        </label>
      )}

      {/* Itens adicionais / negociados */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className={LBL}>Itens adicionais / negociados</span>
          <button type="button" onClick={() => saveItens([...itens, { nome: '', como: ITEM_COMO_OPTIONS[1], valor: null }])}
            className="inline-flex items-center gap-1.5 h-7 px-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50">
            <Plus className="w-3.5 h-3.5" /> Adicionar item
          </button>
        </div>
        {itens.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nenhum item adicional.</p>
        ) : (
          <div className="space-y-2">
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_110px_auto] gap-2 items-center">
                <input defaultValue={it.nome} placeholder="Item" onBlur={(e) => updItem(i, { nome: e.target.value })} className={FIELD} />
                <select value={it.como} onChange={(e) => updItem(i, { como: e.target.value })} className={FIELD}>
                  {ITEM_COMO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input defaultValue={it.valor != null ? String(it.valor) : ''} placeholder="R$" inputMode="decimal"
                  onBlur={(e) => { const n = Number(e.target.value.replace(/\./g, '').replace(',', '.')); updItem(i, { valor: e.target.value.trim() && !Number.isNaN(n) ? n : null }) }} className={FIELD} />
                <button type="button" onClick={() => saveItens(itens.filter((_, idx) => idx !== i))} className="p-1.5 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remover item">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Ação Promocional (definição — disparo é em Convidados) ───────────────────
export function AcaoPromoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  return (
    <section className={CARD}>
      <header className="flex items-center gap-2 mb-3">
        <Megaphone className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">Ação promocional (definição)</h2>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Nº de quartos a bloquear" type="number" value={readStr(pd, PLANEJ_FIELD.quartosBloquear)} onSave={(v) => set(PLANEJ_FIELD.quartosBloquear, v)} />
        <TextField label="Tarifa promocional (R$/noite)" type="number" value={readStr(pd, PLANEJ_FIELD.promoTarifa)} onSave={(v) => set(PLANEJ_FIELD.promoTarifa, v)} />
        <TextField label="Início da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoInicio)} onSave={(v) => set(PLANEJ_FIELD.promoInicio, v)} />
        <TextField label="Fim da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoFim)} onSave={(v) => set(PLANEJ_FIELD.promoFim, v)} />
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5">Aqui só se <b className="text-slate-600">define</b> a promo (tarifa + janela). O disparo das mensagens aos convidados é na área de Convidados.</p>
    </section>
  )
}

// ── Convidados (lista & estimativa — sem confirmação, que é Convidados) ──────
export function ConvidadosResumoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  const listaTotal = wedding.counts.total
  const quartos = readNum(pd, PLANEJ_FIELD.quartosBloquear)

  return (
    <section className={CARD}>
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#BD965C]" />
          <h2 className="text-base font-semibold text-slate-900">Convidados (lista & estimativa)</h2>
        </div>
        <Link to={`/convidados/casamento/${wedding.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline">
          Abrir Convidados <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TextField label="Contrato (até X pax)" type="number" value={readStr(pd, PLANEJ_FIELD.convidadosContrato)} onSave={(v) => set(PLANEJ_FIELD.convidadosContrato, v)} />
        <TextField label="Pensam em ir (estim.)" type="number" value={readStr(pd, PLANEJ_FIELD.convidadosEstimado)} onSave={(v) => set(PLANEJ_FIELD.convidadosEstimado, v)} />
        <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
          <p className={LBL}>Lista preenchida</p>
          <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{listaTotal}</p>
          <p className="text-[11px] text-slate-400">nomes na lista</p>
        </div>
        <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
          <p className={LBL}>Quartos a bloquear</p>
          <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{quartos ?? '—'}</p>
          <p className="text-[11px] text-slate-400">para convidados</p>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5"><b className="text-slate-600">Confirmação</b> (quem comprou) e a sequência promocional acontecem na área de Convidados.</p>
    </section>
  )
}
