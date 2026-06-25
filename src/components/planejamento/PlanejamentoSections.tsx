import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJ_FIELD } from '../../hooks/planejamento/types'
import { TextField, BoolField } from './fields'
import { FIELD, LBL, readStr } from './fieldStyles'

// Corpos "bare" — o cabeçalho/colapso/cor vêm do BlocoColapsavel na página.

// ── Notas da planejadora (texto livre) ──────────────────────────────────────
export function NotasSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  return (
    <div className="pt-3">
      <textarea
        defaultValue={readStr(pd, PLANEJ_FIELD.notas)}
        rows={4}
        placeholder="Contexto, combinados, preferências e pendências do casal…"
        onBlur={(e) => set(PLANEJ_FIELD.notas, e.target.value.trim())}
        className={cn(FIELD, 'w-full')}
      />
    </div>
  )
}

// ── Ação Promocional (definição — disparo é em Convidados) ───────────────────
export function AcaoPromoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  return (
    <div className="pt-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField label="Tarifa promocional (R$/noite)" type="number" value={readStr(pd, PLANEJ_FIELD.promoTarifa)} onSave={(v) => set(PLANEJ_FIELD.promoTarifa, v)} />
        <TextField label="Início da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoInicio)} onSave={(v) => set(PLANEJ_FIELD.promoInicio, v)} />
        <TextField label="Fim da promo" type="date" value={readStr(pd, PLANEJ_FIELD.promoFim)} onSave={(v) => set(PLANEJ_FIELD.promoFim, v)} />
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5">Aqui só se <b className="text-slate-600">define</b> a promo (tarifa + janela). O nº de quartos a bloquear fica em Hospedagem &amp; Bloqueio; o disparo das mensagens é na área de Convidados.</p>
    </div>
  )
}

// ── Convidados (lista, contrato & estimativa) ───────────────────────────────
export function ConvidadosResumoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado
  const listaPreenchida = readStr(pd, PLANEJ_FIELD.listaPreenchida) === 'true'

  return (
    <div className="pt-3">
      <div className="flex justify-end mb-2">
        <Link to={`/convidados/casamento/${wedding.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline">
          Abrir Convidados <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
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
    </div>
  )
}
