import { DollarSign, Bookmark, AlertTriangle, ClipboardCheck, Bot, Hand, MessageCircle, UserCog, type LucideIcon } from 'lucide-react'
import { TIPO_LABEL, SOURCE_LABEL, type TipoConcierge, type SourceConcierge } from '../../hooks/concierge/types'
import { cn } from '../../lib/utils'

const TIPO_ICON: Record<TipoConcierge, LucideIcon> = {
  oferta:      DollarSign,
  reserva:     Bookmark,
  suporte:     AlertTriangle,
  operacional: ClipboardCheck,
}

const SOURCE_ICON: Record<SourceConcierge, LucideIcon> = {
  cadencia:        Bot,
  manual:          Hand,
  cliente:         MessageCircle,
  planner_request: UserCog,
}

interface TipoBadgeProps {
  tipo: TipoConcierge
  size?: 'xs' | 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

export function TipoBadge({ tipo, size = 'xs', showLabel = true, className }: TipoBadgeProps) {
  const meta = TIPO_LABEL[tipo]
  const Icon = TIPO_ICON[tipo]
  const sizeCls =
    size === 'md' ? 'px-2 py-1 text-[12px] gap-1.5' :
    size === 'sm' ? 'px-1.5 py-0.5 text-[11px] gap-1' :
    'px-1.5 py-0.5 text-[10.5px] gap-1'
  const iconCls = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'
  return (
    <span className={cn('inline-flex items-center rounded font-semibold', meta.bgColor, meta.color, sizeCls, className)}>
      <Icon className={iconCls} strokeWidth={2.5} />
      {showLabel && meta.label}
    </span>
  )
}

export function TipoIcon({ tipo, className }: { tipo: TipoConcierge; className?: string }) {
  const meta = TIPO_LABEL[tipo]
  const Icon = TIPO_ICON[tipo]
  return <Icon className={cn(meta.color, className)} strokeWidth={2.5} />
}

interface SourceBadgeProps {
  source: SourceConcierge
  size?: 'xs' | 'sm'
  showLabel?: boolean
  className?: string
}

export function SourceBadge({ source, size = 'xs', showLabel = true, className }: SourceBadgeProps) {
  const meta = SOURCE_LABEL[source]
  const Icon = SOURCE_ICON[source]
  const iconCls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'
  return (
    <span className={cn('inline-flex items-center gap-1 text-slate-500', className)}>
      <Icon className={iconCls} />
      {showLabel && meta.label}
    </span>
  )
}

export function SourceIcon({ source, className }: { source: SourceConcierge; className?: string }) {
  const Icon = SOURCE_ICON[source]
  return <Icon className={className} />
}
