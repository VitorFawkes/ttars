import { cn } from '@/lib/utils'
import type { TripItemStatus } from '@/types/viagem'
import { Check, Clock, X, Wrench, Plane, Archive } from 'lucide-react'

const STATUS_CONFIG: Record<
  Exclude<TripItemStatus, 'rascunho'>,
  { label: string; color: string; icon: typeof Check }
> = {
  proposto: { label: 'Proposto', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: Clock },
  aprovado: { label: 'Aprovado', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: Check },
  recusado: { label: 'Recusado', color: 'bg-red-50 text-red-500 border-red-200', icon: X },
  operacional: { label: 'Pronto', color: 'bg-violet-50 text-violet-600 border-violet-200', icon: Wrench },
  vivido: { label: 'Vivido', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: Plane },
  arquivado: { label: 'Arquivado', color: 'bg-slate-50 text-slate-500 border-slate-200', icon: Archive },
}

interface StatusBadgeProps {
  status: TripItemStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (status === 'rascunho') return null

  const config = STATUS_CONFIG[status]
  if (!config) return null

  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
