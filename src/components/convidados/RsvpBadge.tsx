import { cn } from '../../lib/utils'
import { STATUS_RSVP_LABEL, type StatusRSVP } from '../../hooks/convidados/types'

const STYLES: Record<StatusRSVP, string> = {
  nao_vai: 'bg-rose-50 text-rose-700 border-rose-200',
  sem_reacao: 'bg-slate-100 text-slate-700 border-slate-200',
  intencao: 'bg-sky-50 text-sky-700 border-sky-200',
  confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

interface RsvpBadgeProps {
  status: StatusRSVP
  count?: number
  className?: string
}

export function RsvpBadge({ status, count, className }: RsvpBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        STYLES[status],
        className,
      )}
    >
      {count !== undefined && <span className="tabular-nums">{count}</span>}
      <span>{STATUS_RSVP_LABEL[status]}</span>
    </span>
  )
}
