import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TripItem, TripComment, TripItemTipo } from '@/types/viagem'
import { StatusBadge } from './StatusBadge'
import { CommentThread } from './CommentThread'
import { AlternativesCarousel } from './AlternativesCarousel'
import { VoucherCard } from './VoucherCard'
import {
  Hotel, Plane as PlaneIcon, Car, MapPin, UtensilsCrossed,
  Shield, Lightbulb, FileText, Phone, Type, ListChecks,
} from 'lucide-react'

const TIPO_ICONS: Record<TripItemTipo, typeof Hotel> = {
  dia: MapPin,
  hotel: Hotel,
  voo: PlaneIcon,
  transfer: Car,
  passeio: MapPin,
  refeicao: UtensilsCrossed,
  seguro: Shield,
  dica: Lightbulb,
  voucher: FileText,
  contato: Phone,
  texto: Type,
  checklist: ListChecks,
}

const TIPO_COLORS: Record<TripItemTipo, string> = {
  dia: 'bg-slate-100 text-slate-600',
  hotel: 'bg-amber-50 text-amber-600',
  voo: 'bg-sky-50 text-sky-600',
  transfer: 'bg-violet-50 text-violet-600',
  passeio: 'bg-emerald-50 text-emerald-600',
  refeicao: 'bg-orange-50 text-orange-600',
  seguro: 'bg-blue-50 text-blue-600',
  dica: 'bg-yellow-50 text-yellow-600',
  voucher: 'bg-indigo-50 text-indigo-600',
  contato: 'bg-pink-50 text-pink-600',
  texto: 'bg-slate-50 text-slate-500',
  checklist: 'bg-teal-50 text-teal-600',
}

interface ItemCardProps {
  item: TripItem
  comments: TripComment[]
  onApprove?: (itemId: string) => void
  onChooseAlternative?: (itemId: string, altId: string) => void
  onComment?: (itemId: string, texto: string) => void
  isApproving?: boolean
  isCommenting?: boolean
  readOnly?: boolean
}

export function ItemCard({
  item,
  comments,
  onApprove,
  onChooseAlternative,
  onComment,
  isApproving,
  isCommenting,
  readOnly,
}: ItemCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)

  const Icon = TIPO_ICONS[item.tipo] ?? MapPin
  const comercial = item.comercial as Record<string, string | number | string[] | undefined>
  const titulo = (comercial.titulo as string) ?? ''
  const descricao = (comercial.descricao as string) ?? ''
  const preco = comercial.preco as number | undefined
  const fotos = (comercial.fotos as string[]) ?? []
  const hasAlternatives = item.alternativas.length > 0 && item.status === 'proposto'
  const canApprove = item.status === 'proposto' && !readOnly && !hasAlternatives
  const showOperacional = ['operacional', 'vivido', 'arquivado'].includes(item.status)
  const itemComments = comments.filter((c) => c.item_id === item.id)

  // Voucher rendering
  if (item.tipo === 'voucher' && showOperacional) {
    return <VoucherCard item={item} />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Photo */}
      {fotos.length > 0 && (
        <img
          src={fotos[0]}
          alt={titulo}
          className="w-full aspect-[16/9] object-cover"
          loading="lazy"
        />
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TIPO_COLORS[item.tipo])}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{titulo || item.tipo}</h3>
            {preco != null && preco > 0 && (
              <p className="text-sm font-medium text-indigo-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco)}
              </p>
            )}
          </div>
          <StatusBadge status={item.status} />
        </div>

        {/* Description (collapsible) */}
        {descricao && (
          <>
            <p className={cn('text-sm text-slate-600', !expanded && 'line-clamp-2')}>
              {descricao}
            </p>
            {descricao.length > 120 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-indigo-600 font-medium flex items-center gap-0.5"
              >
                {expanded ? 'Menos' : 'Mais detalhes'}
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </>
        )}

        {/* Alternatives */}
        {hasAlternatives && onChooseAlternative && (
          <AlternativesCarousel
            item={item}
            onChoose={(altId) => onChooseAlternative(item.id, altId)}
          />
        )}

        {/* Operacional info */}
        {showOperacional && Object.keys(item.operacional).length > 0 && (
          <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 space-y-1">
            {(item.operacional as Record<string, string>).numero_reserva && (
              <p className="text-xs text-violet-700">
                <span className="font-medium">Reserva:</span> {(item.operacional as Record<string, string>).numero_reserva}
              </p>
            )}
            {(item.operacional as Record<string, string>).endereco && (
              <p className="text-xs text-violet-700">
                <span className="font-medium">Endereço:</span> {(item.operacional as Record<string, string>).endereco}
              </p>
            )}
            {(item.operacional as Record<string, string>).telefone && (
              <p className="text-xs text-violet-700">
                <span className="font-medium">Telefone:</span> {(item.operacional as Record<string, string>).telefone}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {canApprove && onApprove && (
            <button
              type="button"
              onClick={() => onApprove(item.id)}
              disabled={isApproving}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Aprovar
            </button>
          )}

          {!readOnly && onComment && (
            <button
              type="button"
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {itemComments.length > 0 ? itemComments.length : 'Comentar'}
            </button>
          )}
        </div>

        {/* Comments */}
        {showComments && onComment && (
          <CommentThread
            comments={itemComments}
            onComment={(texto) => onComment(item.id, texto)}
            isSubmitting={isCommenting}
          />
        )}
      </div>
    </div>
  )
}
