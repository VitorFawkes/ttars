import { useState } from 'react'
import { BedDouble, Plus, Pencil, Trash2, ChevronDown, Users, Calendar, MapPin } from 'lucide-react'
import { cn } from '../../lib/utils'
import { brl, formatDataCurta } from '../../lib/planejamento/format'
import { useWeddingHospedagem } from '../../hooks/planejamento/useWeddingHospedagem'
import {
  HOSPEDAGEM_STATUS_LABEL,
  HOSPEDAGEM_STATUS_LIST,
  type HospedagemBloco,
  type HospedagemStatus,
} from '../../hooks/planejamento/types'
import { AddHospedagemModal } from './AddHospedagemModal'

const STATUS_CHIP: Record<HospedagemStatus, string> = {
  a_definir: 'bg-slate-100 text-slate-600 border-slate-200',
  bloqueado: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** Bloco "Hospedagem" do detalhe do casamento: blocos de hotel reservados,
 *  com datas, quartos, tarifa, status e ocupação agregada de convidados. */
export function HospedagemSection({ cardId, confirmados }: { cardId: string | null; confirmados: number }) {
  const { blocos, add, remove, update, setStatus } = useWeddingHospedagem(cardId)
  const [modal, setModal] = useState<{ edit: HospedagemBloco | null } | null>(null)

  const alocados = blocos.reduce((s, b) => s + (b.hospedes_alocados ?? 0), 0)

  const handleSubmit = (payload: Omit<HospedagemBloco, 'id'>) => {
    const editing = modal?.edit
    if (editing) {
      update.mutate({ ...editing, ...payload }, { onSuccess: () => setModal(null) })
    } else {
      add.mutate(payload, { onSuccess: () => setModal(null) })
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BedDouble className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Hospedagem</h2>
          {confirmados > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {alocados} de {confirmados} convidados alocados
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModal({ edit: null })}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar hospedagem
        </button>
      </header>

      {blocos.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">
          Nenhum hotel ainda — adicione blocos de quartos para os convidados.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {blocos.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 break-words">{b.hotel}</p>
                <div className="mt-0.5 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                  {b.localizacao && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {b.localizacao}
                    </span>
                  )}
                  {(b.check_in || b.check_out) && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {[formatDataCurta(b.check_in), formatDataCurta(b.check_out)].filter(Boolean).join(' – ') || '—'}
                    </span>
                  )}
                  {b.quartos != null && <span>{b.quartos} quartos</span>}
                  <span>
                    {b.hospedes_alocados} hósp.
                  </span>
                  {b.tarifa != null && <span>{brl.format(b.tarifa)}</span>}
                </div>
                {b.contato && <p className="text-[11px] text-slate-500 mt-0.5 break-words">{b.contato}</p>}
                {b.observacoes && (
                  <p className="text-[11px] text-slate-500 mt-0.5 break-words whitespace-pre-wrap">{b.observacoes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={cn(
                    'relative inline-flex items-center rounded-full border text-[10px] font-semibold uppercase tracking-wide',
                    STATUS_CHIP[b.status],
                  )}
                  title="Mudar status"
                >
                  <select
                    value={b.status}
                    onChange={(e) => setStatus.mutate({ id: b.id, status: e.target.value as HospedagemStatus })}
                    className="appearance-none bg-transparent pl-2 pr-5 py-0.5 rounded-full cursor-pointer focus:outline-none uppercase"
                    aria-label={`Status de ${b.hotel}`}
                  >
                    {HOSPEDAGEM_STATUS_LIST.map((s) => (
                      <option key={s} value={s} className="bg-white text-slate-700 normal-case">
                        {HOSPEDAGEM_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                </div>
                <button
                  type="button"
                  onClick={() => setModal({ edit: b })}
                  className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Editar hospedagem"
                  aria-label={`Editar ${b.hotel}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(b.id)}
                  disabled={remove.isPending}
                  className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  title="Remover hospedagem"
                  aria-label={`Remover ${b.hotel}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <AddHospedagemModal
          initial={modal.edit}
          saving={add.isPending || update.isPending}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}
