import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, ChevronRight, CheckCircle2, Users, Calendar, BedDouble, BellOff, Trash2, Check, X, Ban } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { mockHotelRooms } from '../../../hooks/convidados/mockHotel'
import { useUpdateWeddingEtapa } from '../../../hooks/convidados/useUpdateWeddingEtapa'
import { useWeddingFluxo } from '../../../hooks/convidados/useWeddingFluxo'
import {
  ETAPA_LABEL,
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
  const { assignment } = useWeddingFluxo(wedding.id)
  const inicioConfig = assignment ? SHORT_DATE(assignment.startDate) : null

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
          <EtapaChip etapa={wedding.etapa} />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <EtapaActionButton
            cardId={wedding.id}
            currentEtapa={wedding.etapa}
            target="encerrado"
            icon={<BellOff className="w-4 h-4" />}
            label="Encerrar"
            description="Encerra a comunicação com os convidados deste casamento (etapa Encerrado)."
            confirmLabel="Encerrar comunicação"
            iconClass="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            disabledLabel="Já está encerrado"
          />
          <EtapaActionButton
            cardId={wedding.id}
            currentEtapa={wedding.etapa}
            target="cancelado"
            icon={<Trash2 className="w-4 h-4" />}
            label="Cancelar"
            description="Marca este casamento como cancelado (etapa Cancelado)."
            confirmLabel="Cancelar casamento"
            iconClass="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
            disabledLabel="Já está cancelado"
          />
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

      <FluxoBanner etapa={wedding.etapa} inicioConfig={inicioConfig} />

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

      {/* Hotel — mockup */}
      <HotelBar cardId={wedding.id} local={wedding.local} />

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

// Linha "Hotel" (mockup) — mesmo visual da linha "Convidados".
function HotelBar({ cardId, local }: { cardId: string; local: string | null }) {
  const { total, disponiveis } = mockHotelRooms(cardId)
  const hotelLabel = local ?? 'Hotel não definido'
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
        <BedDouble className="w-4 h-4 text-slate-500 shrink-0" />
        <span className="truncate" title={hotelLabel}>{hotelLabel}</span>
      </div>
      <div className="text-sm tabular-nums shrink-0">
        <span className="font-semibold text-slate-900">{disponiveis}</span>
        <span className="text-slate-500">/{total} quartos</span>
      </div>
    </div>
  )
}

interface EtapaChipProps {
  etapa: EtapaConvidados
}

/** Banner do fluxo no card. Muda visualmente conforme a etapa:
 *  - sem assignment → amarelo "Fluxo a configurar"
 *  - promo / padrão → verde "Fluxo configurado"
 *  - encerrado → cinza "Comunicação encerrada"
 *  - cancelado → rose "Casamento cancelado" */
interface FluxoBannerProps {
  etapa: EtapaConvidados
  inicioConfig: string | null
}

function FluxoBanner({ etapa, inicioConfig }: FluxoBannerProps) {
  if (etapa === 'encerrado') {
    return (
      <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 flex items-start gap-2">
        <BellOff className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700 leading-tight">Comunicação encerrada</p>
          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
            Nenhuma mensagem nova será enviada.
          </p>
        </div>
      </div>
    )
  }

  if (etapa === 'cancelado') {
    return (
      <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 flex items-start gap-2">
        <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-700 leading-tight">Casamento cancelado</p>
          <p className="text-[11px] text-rose-700/70 leading-tight mt-0.5">
            Fluxo interrompido. O casamento não vai acontecer.
          </p>
        </div>
      </div>
    )
  }

  if (!inicioConfig) {
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-700 leading-tight">Fluxo a configurar</p>
          <p className="text-[11px] text-amber-700/70 leading-tight mt-0.5">
            Nenhum fluxo vinculado a este casamento.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-700 leading-tight">Fluxo configurado</p>
        <p className="text-[11px] text-emerald-700/70 leading-tight mt-0.5">
          Início: em {inicioConfig}
        </p>
      </div>
    </div>
  )
}

/** Chip estático mostrando a etapa atual. Clicar aqui propaga o evento
 *  para a `<article>` pai, abrindo a página de detalhe do casamento.
 *  Etapa é derivada do fluxo configurado (promo/padrão) ou estado manual
 *  (encerrado/cancelado). */
function EtapaChip({ etapa }: EtapaChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wide shrink-0 mt-0.5',
        ETAPA_CHIP[etapa],
      )}
      title={`Etapa: ${ETAPA_LABEL[etapa]}`}
    >
      {ETAPA_LABEL[etapa]}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Botão genérico de ação de etapa (Encerrar / Cancelar) com confirmação inline
// ──────────────────────────────────────────────────────────────────────────

interface EtapaActionButtonProps {
  cardId: string
  currentEtapa: EtapaConvidados
  target: EtapaConvidados
  icon: React.ReactNode
  label: string
  description: string
  confirmLabel: string
  iconClass: string
  disabledLabel: string
}

function EtapaActionButton({
  cardId,
  currentEtapa,
  target,
  icon,
  label,
  description,
  confirmLabel,
  iconClass,
  disabledLabel,
}: EtapaActionButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate, isPending } = useUpdateWeddingEtapa()
  const { clear: clearFluxo } = useWeddingFluxo(cardId)
  const already = currentEtapa === target

  useEffect(() => {
    if (!confirming) return
    const onClickOutside = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setConfirming(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [confirming])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (!already) setConfirming(c => !c)
        }}
        disabled={isPending || already}
        className={cn(
          'h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors',
          iconClass,
          (isPending || already) && 'opacity-40 cursor-not-allowed hover:bg-transparent',
        )}
        aria-label={label}
        title={already ? disabledLabel : label}
      >
        {icon}
      </button>
      {confirming && (
        <div
          className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 shadow-lg rounded-lg p-3"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-slate-700 mb-2">{description}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(false)
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(false)
                mutate({ cardId, etapa: target })
                // Encerrado e Cancelado desconfiguram o fluxo do casamento.
                clearFluxo()
              }}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white rounded-md',
                target === 'cancelado' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-700 hover:bg-slate-800',
              )}
            >
              <Check className="w-3 h-3" /> {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

