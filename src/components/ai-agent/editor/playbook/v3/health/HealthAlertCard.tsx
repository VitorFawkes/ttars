import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HealthAlert } from './types'

interface Props {
  alert: HealthAlert
  onResolve?: () => void
}

const SEVERITY_STYLES: Record<HealthAlert['severity'], {
  bg: string
  border: string
  iconColor: string
  icon: typeof AlertTriangle
  label: string
  labelBg: string
}> = {
  blocker: {
    bg: 'bg-rose-50/40',
    border: 'border-rose-200',
    iconColor: 'text-rose-600',
    icon: AlertCircle,
    label: 'Bloqueia ativação',
    labelBg: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  warning: {
    bg: 'bg-amber-50/40',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    icon: AlertTriangle,
    label: 'Atenção',
    labelBg: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  info: {
    bg: 'bg-slate-50/60',
    border: 'border-slate-200',
    iconColor: 'text-slate-500',
    icon: Info,
    label: 'Sugestão',
    labelBg: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

export function HealthAlertCard({ alert, onResolve }: Props) {
  const style = SEVERITY_STYLES[alert.severity]
  const Icon = style.icon

  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', style.bg, style.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', style.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide', style.labelBg)}>
              {style.label}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-500 font-medium">
              {alert.category}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-slate-900 mb-1">{alert.title}</h4>
          <p className="text-xs text-slate-600 leading-relaxed">{alert.detail}</p>
          {alert.suggestion && (
            <p className="text-xs text-slate-500 italic mt-1.5">→ {alert.suggestion}</p>
          )}
          {onResolve && (
            <button
              type="button"
              onClick={onResolve}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Ir resolver
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
