import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import {
  HOTEL_STATUS_LABEL,
  HOTEL_STATUS_LIST,
  type HotelStatus,
  type WeddingHotel,
} from '../../hooks/convidados/types'

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

const toIntOrNull = (v: string): number | null => {
  const n = parseInt(v.trim(), 10)
  return Number.isNaN(n) ? null : n
}

/** Modal único de criar/editar a ficha de hotel de um casamento. Usado tanto
 *  em Convidados quanto em Planejamento — garante uma fonte só. */
export function WeddingHotelModal({
  initial,
  defaultNome,
  saving,
  onClose,
  onSubmit,
  onClear,
}: {
  initial?: WeddingHotel | null
  /** Prefill do nome quando ainda não há ficha (ex.: wedding.local). */
  defaultNome?: string | null
  saving: boolean
  onClose: () => void
  onSubmit: (payload: WeddingHotel) => void
  onClear?: () => void
}) {
  const isEdit = !!initial
  const [nome, setNome] = useState(initial?.nome ?? defaultNome ?? '')
  const [categoria, setCategoria] = useState(initial?.categoria ?? '')
  const [localizacao, setLocalizacao] = useState(initial?.localizacao ?? '')
  const [checkIn, setCheckIn] = useState(initial?.check_in ?? '')
  const [checkOut, setCheckOut] = useState(initial?.check_out ?? '')
  const [totalQuartos, setTotalQuartos] = useState(
    initial?.total_quartos != null ? String(initial.total_quartos) : '',
  )
  const [reservados, setReservados] = useState(
    initial?.quartos_reservados != null ? String(initial.quartos_reservados) : '',
  )
  const [contatoNome, setContatoNome] = useState(initial?.contato_nome ?? '')
  const [contatoEmail, setContatoEmail] = useState(initial?.contato_email ?? '')
  const [contatoTelefone, setContatoTelefone] = useState(initial?.contato_telefone ?? '')
  const [siteUrl, setSiteUrl] = useState(initial?.site_url ?? '')
  const [tarifa, setTarifa] = useState(initial?.tarifa != null ? String(initial.tarifa) : '')
  const [status, setStatus] = useState<HotelStatus>(initial?.status ?? 'a_definir')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')

  const canSave = nome.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const tarifaParsed = tarifa.trim() ? Number(tarifa.replace(/\./g, '').replace(',', '.')) : null
    onSubmit({
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      localizacao: localizacao.trim() || null,
      check_in: checkIn.trim() || null,
      check_out: checkOut.trim() || null,
      total_quartos: toIntOrNull(totalQuartos),
      quartos_reservados: toIntOrNull(reservados) ?? 0,
      contato_nome: contatoNome.trim() || null,
      contato_email: contatoEmail.trim() || null,
      contato_telefone: contatoTelefone.trim() || null,
      site_url: siteUrl.trim() || null,
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
      <div className="w-full max-w-lg bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col max-h-[90vh]">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Editar hotel' : 'Configurar hotel'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          <label className="text-xs font-medium text-slate-700 block">
            Hotel *
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Pousada Praia do Forte"
              className={FIELD_CLS}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              Categoria (opcional)
              <input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex.: Suíte Standard"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Localização (opcional)
              <input
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                placeholder="Cidade / região"
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
              Total de quartos
              <input
                value={totalQuartos}
                onChange={(e) => setTotalQuartos(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Reservados
              <input
                value={reservados}
                onChange={(e) => setReservados(e.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              Contato (opcional)
              <input
                value={contatoNome}
                onChange={(e) => setContatoNome(e.target.value)}
                placeholder="Nome do contato"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Telefone (opcional)
              <input
                value={contatoTelefone}
                onChange={(e) => setContatoTelefone(e.target.value)}
                placeholder="(00) 0000-0000"
                className={FIELD_CLS}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-700 block">
              E-mail (opcional)
              <input
                value={contatoEmail}
                onChange={(e) => setContatoEmail(e.target.value)}
                placeholder="reservas@hotel.com"
                className={FIELD_CLS}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 block">
              Site / link de reserva (opcional)
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://…"
                className={FIELD_CLS}
              />
            </label>
          </div>

          <label className="text-xs font-medium text-slate-700 block">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as HotelStatus)} className={FIELD_CLS}>
              {HOTEL_STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {HOTEL_STATUS_LABEL[s]}
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

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <div>
            {isEdit && onClear && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Remover hotel
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Configurar'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
