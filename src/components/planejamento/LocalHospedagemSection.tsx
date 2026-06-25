import { useState } from 'react'
import { FileSignature, BedDouble, Plus, Trash2, CalendarRange } from 'lucide-react'
import { cn } from '../../lib/utils'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import { useWeddingHotel } from '../../hooks/convidados/useWeddingHotel'
import { WeddingHotelCard } from '../convidados/WeddingHotelCard'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import {
  PLANEJ_FIELD,
  REGIAO_OPTIONS,
  FORMATO_OPTIONS,
  TIPO_LOCAL_LIST,
  TIPO_LOCAL_LABEL,
  ITEM_COMO_OPTIONS,
  type TipoLocal,
  type EspacoItem,
} from '../../hooks/planejamento/types'
import { TextField, SelectField, BoolField } from './fields'
import { FIELD, LBL, SUB, readStr } from './fieldStyles'

function readItens(pd: Record<string, unknown> | null): EspacoItem[] {
  const v = pd?.[PLANEJ_FIELD.itens]
  return Array.isArray(v) ? (v as EspacoItem[]) : []
}

/**
 * "Local & Cerimônia" — ONDE o casamento acontece (venue + pacote/regras + itens)
 * e a RESERVA & contrato (sinal + valor + assinatura). Corpo "bare": o cabeçalho/
 * colapso vem do BlocoColapsavel na página.
 */
export function LocalCerimoniaBody({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  const tipo = (readStr(pd, PLANEJ_FIELD.tipoLocal) || 'resort_hotel') as TipoLocal
  const espaco = readStr(pd, PLANEJ_FIELD.espaco)
  const contratoAssinado = readStr(pd, PLANEJ_FIELD.contratoAssinado) === 'true'

  const [itens, setItens] = useState<EspacoItem[]>(() => readItens(pd))
  const saveItens = (next: EspacoItem[]) => { setItens(next); save.mutate({ cardId: wedding.id, values: { [PLANEJ_FIELD.itens]: next } }) }
  const updItem = (i: number, patch: Partial<EspacoItem>) => saveItens(itens.map((it, idx) => idx === i ? { ...it, ...patch } : it))

  return (
    <div className="pt-3">
      <p className={SUB}>Onde o casamento acontece</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <SelectField label="Região" value={readStr(pd, PLANEJ_FIELD.regiao)} options={REGIAO_OPTIONS} onSave={(v) => set(PLANEJ_FIELD.regiao, v)} />
        <SelectField label="Formato" value={readStr(pd, PLANEJ_FIELD.formato)} options={FORMATO_OPTIONS} onSave={(v) => set(PLANEJ_FIELD.formato, v)} />
        <label className="block">
          <span className={LBL}>Tipo do local</span>
          <select value={tipo} onChange={(e) => set(PLANEJ_FIELD.tipoLocal, e.target.value)} className={cn(FIELD, 'mt-1')}>
            {TIPO_LOCAL_LIST.map((t) => <option key={t} value={t}>{TIPO_LOCAL_LABEL[t]}</option>)}
          </select>
        </label>
        <TextField label="Espaço / local escolhido" value={espaco} placeholder="Ex.: Fasano Trancoso" onSave={(v) => set(PLANEJ_FIELD.espaco, v)} />
      </div>

      {tipo === 'resort_hotel' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <TextField label="Pacote escolhido" value={readStr(pd, PLANEJ_FIELD.pacoteNome)} placeholder="Ex.: Designed by Destination" onSave={(v) => set(PLANEJ_FIELD.pacoteNome, v)} />
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

      {/* Reserva & contrato */}
      <div className="mt-5 pt-4 border-t border-[#F0E9DD]">
        <p className={cn(SUB, 'flex items-center gap-1.5')}><FileSignature className="w-3.5 h-3.5" /> Reserva &amp; contrato do casamento</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <TextField label="Sinal pago em" type="date" value={readStr(pd, PLANEJ_FIELD.sinalPagoEm)} onSave={(v) => set(PLANEJ_FIELD.sinalPagoEm, v)} />
          <TextField label="Valor do sinal (R$)" type="number" value={readStr(pd, PLANEJ_FIELD.sinalValor)} onSave={(v) => set(PLANEJ_FIELD.sinalValor, v)} />
          <TextField label="Valor total do casamento (R$)" type="number" value={readStr(pd, PLANEJ_FIELD.valorTotal)} onSave={(v) => set(PLANEJ_FIELD.valorTotal, v)} />
        </div>
        <BoolField label="Contrato do casamento assinado" checked={contratoAssinado} onToggle={(v) => set(PLANEJ_FIELD.contratoAssinado, v ? true : '')} />
      </div>
    </div>
  )
}

/**
 * "Hospedagem & Bloqueio" — o hotel onde os convidados ficam + o detalhe do
 * bloqueio que a planejadora pediu (25/06): o casal PEDE um período/qtd, a gente
 * FECHA outro; saber a diferença + quantos já fecharam pra antecipar reforço +
 * o valor do bloqueio pago pelo casal + a forma de pagamento dos convidados.
 */
export function HospedagemBloqueioBody({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const { hotel, save: saveHotel } = useWeddingHotel(wedding.id)
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  const espaco = readStr(pd, PLANEJ_FIELD.espaco)
  const mesmoLocal = readStr(pd, PLANEJ_FIELD.mesmoLocal) === 'true'

  const usarEspacoComoHotel = () => {
    if (!espaco) return
    saveHotel({
      nome: espaco, categoria: null, localizacao: readStr(pd, PLANEJ_FIELD.regiao) || null,
      check_in: null, check_out: null, total_quartos: null, quartos_reservados: 0,
      contato_nome: null, contato_email: null, contato_telefone: null, site_url: null,
      tarifa: null, status: 'a_definir', observacoes: null,
    })
  }

  return (
    <div className="pt-3">
      <BoolField
        label="O casamento e a hospedagem são no mesmo lugar (resort)"
        checked={mesmoLocal}
        onToggle={(v) => set(PLANEJ_FIELD.mesmoLocal, v ? true : '')}
      />
      {mesmoLocal && espaco && !hotel && (
        <button
          type="button"
          onClick={usarEspacoComoHotel}
          className="mb-2 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-[#8A6A33] border border-[#E6D3B3] bg-[#FBF6E8] rounded-md hover:bg-[#F4ECDD]"
        >
          Usar “{espaco}” como hotel
        </button>
      )}

      <WeddingHotelCard cardId={wedding.id} local={wedding.local} />

      {/* Detalhe do bloqueio (pedido × fechado) — reunião 25/06 */}
      <div className="mt-4 pt-4 border-t border-[#F0E9DD]">
        <p className={cn(SUB, 'flex items-center gap-1.5')}><CalendarRange className="w-3.5 h-3.5" /> Detalhe do bloqueio</p>
        <p className="text-[11px] text-slate-400 mb-2 [font-family:'Roboto']">O “Total de quartos” e o check-in/out acima são o bloqueio FECHADO. Aqui registramos o que o casal PEDIU, quantos já fecharam e o valor.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TextField label="Apartamentos que o casal pediu" type="number" value={readStr(pd, PLANEJ_FIELD.bloqueioAptosPedido)} onSave={(v) => set(PLANEJ_FIELD.bloqueioAptosPedido, v)} />
          <TextField label="Período pedido — entrada" type="date" value={readStr(pd, PLANEJ_FIELD.bloqueioPeriodoPedidoIn)} onSave={(v) => set(PLANEJ_FIELD.bloqueioPeriodoPedidoIn, v)} />
          <TextField label="Período pedido — saída" type="date" value={readStr(pd, PLANEJ_FIELD.bloqueioPeriodoPedidoOut)} onSave={(v) => set(PLANEJ_FIELD.bloqueioPeriodoPedidoOut, v)} />
          <TextField label="Quantos já fecharam" type="number" value={readStr(pd, PLANEJ_FIELD.bloqueioAptosFechados)} onSave={(v) => set(PLANEJ_FIELD.bloqueioAptosFechados, v)} />
          <TextField label="Categoria(s) de apto" value={readStr(pd, PLANEJ_FIELD.bloqueioCategorias)} placeholder="ex.: Junior Suite Deluxe" onSave={(v) => set(PLANEJ_FIELD.bloqueioCategorias, v)} />
          <TextField label="Valor do bloqueio pago pelo casal (R$)" type="number" value={readStr(pd, PLANEJ_FIELD.bloqueioValorCasal)} onSave={(v) => set(PLANEJ_FIELD.bloqueioValorCasal, v)} />
          <div className="sm:col-span-2 lg:col-span-3">
            <TextField label="Forma de pagamento para os convidados" value={readStr(pd, PLANEJ_FIELD.formaPagamentoConvidados)} placeholder="ex.: em até 10x no cartão de crédito" onSave={(v) => set(PLANEJ_FIELD.formaPagamentoConvidados, v)} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <BedDouble className="w-3.5 h-3.5 text-[#BD965C]" />
        <span className="text-[11px] text-slate-400 [font-family:'Roboto']">Convidados que ficam fora do bloqueio entram pelo site do Passaporte (sem reserva extra).</span>
      </div>
    </div>
  )
}
