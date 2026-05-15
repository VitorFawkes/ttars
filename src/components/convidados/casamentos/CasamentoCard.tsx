import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Pencil, Trash2, ChevronRight, ChevronDown, CheckCircle2, Users, Calendar, Check, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useUpdateWeddingEtapa } from '../../../hooks/convidados/useUpdateWeddingEtapa'
import {
  ETAPA_LABEL,
  ETAPA_ORDER,
  type EtapaConvidados,
  type WeddingWithGuests,
} from '../../../hooks/convidados/types'

const MONTH_CODE: Record<number, string> = {
  0: 'JAN', 1: 'FEV', 2: 'MAR', 3: 'ABR', 4: 'MAI', 5: 'JUN',
  6: 'JUL', 7: 'AGO', 8: 'SET', 9: 'OUT', 10: 'NOV', 11: 'DEZ',
}

const MONTH_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

const SHORT_DATE = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const LONG_DATE = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function formatWeddingCode(titulo: string, iso: string | null): string {
  const t = titulo.trim().slice(0, 40)
  if (!iso) return `W - ${t}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return `W - ${t}`
  const dd = String(d.getDate()).padStart(2, '0')
  const mon = MONTH_CODE[d.getMonth()] ?? '---'
  const yy = String(d.getFullYear()).slice(-2)
  return `W - ${t} - ${dd}${mon}${yy}`
}

function isPast(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  // Considera "passado" se a data já se foi (não inclui hoje)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

const ETAPA_CHIP: Record<EtapaConvidados, string> = {
  promo: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  padrao: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  encerrado: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
  cancelado: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
}

interface CasamentoCardProps {
  wedding: WeddingWithGuests
  /** Mantido para compat — quando passada, vence sobre a navegação padrão. */
  onDrillIn?: (cardId: string) => void
}

export function CasamentoCard({ wedding, onDrillIn }: CasamentoCardProps) {
  const navigate = useNavigate()
  // "Ativos" = não declinaram. total − não_vai.
  const ativos = wedding.counts.total - wedding.counts.nao_vai
  const total = wedding.counts.total

  const past = isPast(wedding.wedding_date)
  const codigo = formatWeddingCode(wedding.titulo, wedding.wedding_date ?? wedding.created_at)
  const inicioConfig = SHORT_DATE(wedding.created_at)

  const stop = (e: MouseEvent) => e.stopPropagation()
  const stopPointer = (e: React.PointerEvent) => e.stopPropagation()

  const goToDetail = () => {
    if (onDrillIn) onDrillIn(wedding.id)
    else navigate(`/convidados/casamento/${wedding.id}`)
  }

  return (
    <article
      onClick={goToDetail}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goToDetail()
        }
      }}
      className={cn(
        'bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col gap-3 transition-shadow hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300',
        past && 'opacity-70',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1 flex-wrap">
          <Heart className={cn('w-5 h-5 shrink-0 mt-0.5', past ? 'text-rose-300 fill-rose-300' : 'text-rose-500 fill-rose-500')} />
          <h3
            className="text-base font-semibold text-slate-900 break-words min-w-0"
            title={wedding.titulo}
          >
            {wedding.titulo}
          </h3>
          <EtapaChip cardId={wedding.id} etapa={wedding.etapa} />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <EditEtapaButton cardId={wedding.id} etapa={wedding.etapa} />
          <CancelButton cardId={wedding.id} etapa={wedding.etapa} />
          <button
            type="button"
            onPointerDown={stopPointer}
            onMouseDown={stop}
            onClick={(e) => {
              e.stopPropagation()
              goToDetail()
            }}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            aria-label="Abrir casamento"
            title="Abrir casamento"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-700 leading-tight">Fluxo configurado</p>
          <p className="text-[11px] text-emerald-700/70 leading-tight mt-0.5">
            Início: em {inicioConfig}
          </p>
        </div>
      </div>

      {wedding.wedding_date && (
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span>{LONG_DATE(wedding.wedding_date)}</span>
          {past && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wide">
              Passado
            </span>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Users className="w-4 h-4 text-slate-500 shrink-0" />
          <span>Convidados</span>
        </div>
        <div className="text-sm tabular-nums shrink-0">
          <span className="font-semibold text-slate-900">{ativos}</span>
          <span className="text-slate-500">/{total} ativos</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 break-words" title={codigo}>
        ID: {codigo}
      </p>
    </article>
  )
}

interface EtapaChipProps {
  cardId: string
  etapa: EtapaConvidados
}

function EtapaChip({ cardId, etapa }: EtapaChipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate, isPending } = useUpdateWeddingEtapa()

  useEffect(() => {
    if (!open) return
    const onClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleSelect = (next: EtapaConvidados) => {
    setOpen(false)
    if (next === etapa) return
    mutate({ cardId, etapa: next })
  }

  return (
    <div ref={ref} className="relative shrink-0 mt-0.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wide transition-colors',
          ETAPA_CHIP[etapa],
          isPending && 'opacity-60 cursor-wait',
        )}
        title="Mudar etapa"
        aria-label={`Etapa: ${ETAPA_LABEL[etapa]}. Clique para mudar.`}
      >
        <span>{ETAPA_LABEL[etapa]}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-44 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
          <ul className="py-1">
            {ETAPA_ORDER.map(opt => {
              const active = opt === etapa
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 flex items-center justify-between gap-2',
                      active && 'bg-slate-50 text-slate-900 font-medium',
                    )}
                  >
                    <span>{ETAPA_LABEL[opt]}</span>
                    {active && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

interface EditEtapaButtonProps {
  cardId: string
  etapa: EtapaConvidados
}

function EditEtapaButton({ cardId, etapa }: EditEtapaButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate, isPending } = useUpdateWeddingEtapa()

  useEffect(() => {
    if (!open) return
    const onClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleSelect = (next: EtapaConvidados) => {
    setOpen(false)
    if (next === etapa) return
    mutate({ cardId, etapa: next })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(o => !o)
        }}
        disabled={isPending}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-wait"
        aria-label="Editar etapa"
        title="Editar etapa"
      >
        <Pencil className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
          <ul className="py-1">
            {ETAPA_ORDER.map(opt => {
              const active = opt === etapa
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs text-left hover:bg-slate-50 flex items-center justify-between gap-2',
                      active && 'bg-slate-50 text-slate-900 font-medium',
                    )}
                  >
                    <span>{ETAPA_LABEL[opt]}</span>
                    {active && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

interface CancelButtonProps {
  cardId: string
  etapa: EtapaConvidados
}

function CancelButton({ cardId, etapa }: CancelButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate, isPending } = useUpdateWeddingEtapa()
  const alreadyCancelled = etapa === 'cancelado'

  useEffect(() => {
    if (!confirming) return
    const onClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setConfirming(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [confirming])

  const handleConfirm = () => {
    setConfirming(false)
    mutate({ cardId, etapa: 'cancelado' })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (!alreadyCancelled) setConfirming(c => !c)
        }}
        disabled={isPending || alreadyCancelled}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Cancelar casamento"
        title={alreadyCancelled ? 'Já está em Cancelados' : 'Mover para Cancelados'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
      {confirming && (
        <div className="absolute right-0 top-full mt-1 z-20 w-60 bg-white border border-slate-200 shadow-lg rounded-lg p-3">
          <p className="text-xs text-slate-700 mb-2">
            Mover este casamento para a etapa <strong>Cancelados</strong>?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
            >
              <Check className="w-3 h-3" /> Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
