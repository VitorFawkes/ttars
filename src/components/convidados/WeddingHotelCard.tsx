import { useState, useEffect, useRef } from 'react'
import { BedDouble, Building2, Globe, ExternalLink, Pencil, Plus, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWeddingHotel } from '../../hooks/convidados/useWeddingHotel'
import { HOTEL_STATUS_LABEL, type HotelStatus } from '../../hooks/convidados/types'
import { WeddingHotelModal } from './WeddingHotelModal'

// Ficha de hotel de um casamento — UM componente, usado tanto em Convidados
// quanto em Planejamento. Lê/edita a fonte única (wedding_hotel) via
// useWeddingHotel + WeddingHotelModal. Ocupação por quartos.

const HOTEL_STATUS_CHIP: Record<HotelStatus, string> = {
  a_definir: 'bg-slate-100 text-slate-600 border-slate-200',
  bloqueado: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** "2026-12-14" → "14/12/2026" (sem conversão de fuso). */
function hotelDate(iso: string | null): string | null {
  if (!iso) return null
  const parts = iso.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso
}

export function WeddingHotelCard({ cardId, local }: { cardId: string | null; local: string | null }) {
  const { hotel, save, clear, isSaving } = useWeddingHotel(cardId)
  const [editing, setEditing] = useState(false)

  // Quartos editáveis inline (+/-). Estado local pra resposta imediata; o save
  // é debounced (500ms) pra não disparar um upsert por clique. Mantém o
  // invariante reservados ≤ total.
  const [total, setTotal] = useState(0)
  const [reservados, setReservados] = useState(0)
  useEffect(() => {
    setTotal(hotel?.total_quartos ?? 0)
    setReservados(hotel?.quartos_reservados ?? 0)
  }, [hotel?.total_quartos, hotel?.quartos_reservados])

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const bump = (field: 'total' | 'reservados', delta: number) => {
    if (!hotel) return
    let nextTotal = total
    let nextReservados = reservados
    if (field === 'total') {
      nextTotal = Math.max(0, total + delta)
      nextReservados = Math.min(reservados, nextTotal)
    } else {
      nextReservados = Math.min(Math.max(0, reservados + delta), total)
    }
    setTotal(nextTotal)
    setReservados(nextReservados)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save({ ...hotel, total_quartos: nextTotal, quartos_reservados: nextReservados })
    }, 500)
  }

  const disponiveis = Math.max(0, total - reservados)
  const ocupacao = total > 0 ? Math.round((reservados / total) * 100) : 0

  const datas = hotel
    ? [hotelDate(hotel.check_in), hotelDate(hotel.check_out)].filter(Boolean).join(' – ')
    : ''
  const contato = hotel
    ? [hotel.contato_email, hotel.contato_telefone].filter(Boolean).join(' · ')
    : ''

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <BedDouble className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Hotel</h2>
          {hotel && (
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wide',
                HOTEL_STATUS_CHIP[hotel.status],
              )}
            >
              {HOTEL_STATUS_LABEL[hotel.status]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
        >
          {hotel ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {hotel ? 'Editar' : 'Configurar hotel'}
        </button>
      </header>

      {!hotel ? (
        <p className="text-sm text-slate-400 italic py-2">
          Hotel não definido — configure o bloqueio de quartos para os convidados.
        </p>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
          {/* Identidade do hotel */}
          <div className="md:w-1/2 flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              {hotel.nome}
            </div>
            <p className="text-xs text-slate-500">
              {[hotel.categoria, hotel.localizacao, datas && `Check-in/out ${datas}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
            {contato && <p className="text-xs text-slate-500">Contato: {contato}</p>}
            {hotel.site_url && (
              <a
                href={hotel.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              >
                <Globe className="w-3 h-3" /> Link de reserva <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          {/* Stats de quartos — ajuste rápido com +/- */}
          <div className="md:w-1/2 bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col gap-2.5">
            <Stepper label="Total de quartos" value={total} onDec={() => bump('total', -1)} onInc={() => bump('total', 1)} />
            <Stepper
              label="Reservados"
              value={reservados}
              onDec={() => bump('reservados', -1)}
              onInc={() => bump('reservados', 1)}
              incDisabled={reservados >= total}
            />

            {/* Barra de ocupação */}
            <div className="h-2 bg-white border border-slate-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  ocupacao < 50 ? 'bg-emerald-500' : ocupacao < 80 ? 'bg-amber-500' : 'bg-rose-500',
                )}
                style={{ width: `${ocupacao}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span>{disponiveis} disponíveis</span>
              <span>{ocupacao}% ocupação</span>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <WeddingHotelModal
          initial={hotel}
          defaultNome={local}
          saving={isSaving}
          onClose={() => setEditing(false)}
          onSubmit={(payload) => {
            save(payload)
            setEditing(false)
          }}
          onClear={() => {
            clear()
            setEditing(false)
          }}
        />
      )}
    </section>
  )
}

/** Controle numérico +/- compacto (quartos). */
function Stepper({
  label,
  value,
  onDec,
  onInc,
  incDisabled,
}: {
  label: string
  value: number
  onDec: () => void
  onInc: () => void
  incDisabled?: boolean
}) {
  const btn =
    'w-6 h-6 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="inline-flex items-center gap-1">
        <button type="button" onClick={onDec} disabled={value <= 0} className={btn} aria-label={`Diminuir ${label}`}>
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-9 text-center tabular-nums font-semibold text-slate-900">{value}</span>
        <button type="button" onClick={onInc} disabled={incDisabled} className={btn} aria-label={`Aumentar ${label}`}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
