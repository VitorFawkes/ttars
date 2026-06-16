import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  HOSPEDAGEM_STATUS_LABEL,
  HOSPEDAGEM_STATUS_LIST,
  type HospedagemBloco,
  type HospedagemStatus,
} from '../../hooks/planejamento/types'

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

/** Modal de criar/editar um bloco de hotel. Espelha AddChecklistItemModal. */
export function AddHospedagemModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial?: HospedagemBloco | null
  saving: boolean
  onClose: () => void
  onSubmit: (payload: Omit<HospedagemBloco, 'id'>) => void
}) {
  const isEdit = !!initial
  const [hotel, setHotel] = useState(initial?.hotel ?? '')
  const [localizacao, setLocalizacao] = useState(initial?.localizacao ?? '')
  const [contato, setContato] = useState(initial?.contato ?? '')
  const [checkIn, setCheckIn] = useState(initial?.check_in ?? '')
  const [checkOut, setCheckOut] = useState(initial?.check_out ?? '')
  const [quartos, setQuartos] = useState(initial?.quartos != null ? String(initial.quartos) : '')
  const [hospedes, setHospedes] = useState(
    initial?.hospedes_alocados != null ? String(initial.hospedes_alocados) : '',
  )
  const [tarifa, setTarifa] = useState(initial?.tarifa != null ? String(initial.tarifa) : '')
  const [status, setStatus] = useState<HospedagemStatus>(initial?.status ?? 'a_definir')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')

  const canSave = hotel.trim().length > 0

  const toIntOrNull = (v: string): number | null => {
    const n = parseInt(v.trim(), 10)
    return Number.isNaN(n) ? null : n
  }

  const handleSave = () => {
    if (!canSave) return
    const tarifaParsed = tarifa.trim() ? Number(tarifa.replace(/\./g, '').replace(',', '.')) : null
    onSubmit({
      hotel: hotel.trim(),
      localizacao: localizacao.trim() || null,
      contato: contato.trim() || null,
      check_in: checkIn.trim() || null,
      check_out: checkOut.trim() || null,
      quartos: toIntOrNull(quartos),
      hospedes_alocados: toIntOrNull(hospedes) ?? 0,
      tarifa: tarifaParsed != null && !Number.isNaN(tarifaParsed) ? tarifaParsed : null,
      status,
      observacoes: observacoes.trim() || null,
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Editar hospedagem' : 'Adicionar hospedagem'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-xs font-medium text-slate-700 block">
            Hotel *
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={hotel}
              onChange={(e) => setHotel(e.target.value)}
              placeholder="Ex.: Pousada Maravilha"
              className={FIELD_CLS}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              Localização (opcional)
              <input
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                placeholder="Cidade / região"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Contato (opcional)
              <input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                placeholder="telefone, e-mail ou @"
                className={FIELD_CLS}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              Check-in (opcional)
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={FIELD_CLS} />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Check-out (opcional)
              <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={FIELD_CLS} />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              Quartos
              <input
                value={quartos}
                onChange={(e) => setQuartos(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Hóspedes
              <input
                value={hospedes}
                onChange={(e) => setHospedes(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Tarifa
              <input
                value={tarifa}
                onChange={(e) => setTarifa(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className={FIELD_CLS}
              />
            </label>
          </div>

          <label className="text-xs font-medium text-slate-700 block">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as HospedagemStatus)} className={FIELD_CLS}>
              {HOSPEDAGEM_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {HOSPEDAGEM_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-700 block">
            Observação (opcional)
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Bloqueio, política de cancelamento, links…"
              className={FIELD_CLS}
            />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
