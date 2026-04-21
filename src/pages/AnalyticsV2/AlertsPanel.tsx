import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface AlertItem {
  id: string
  severity: AlertSeverity
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

interface Props {
  alerts: AlertItem[]
  title?: string
  emptyMessage?: string
}

const SEVERITY_STYLE: Record<AlertSeverity, { wrapper: string; icon: string; title: string }> = {
  critical: {
    wrapper: 'bg-red-50 border-red-200',
    icon: 'text-red-500',
    title: 'text-red-900',
  },
  warning: {
    wrapper: 'bg-amber-50 border-amber-200',
    icon: 'text-amber-500',
    title: 'text-amber-900',
  },
  info: {
    wrapper: 'bg-sky-50 border-sky-200',
    icon: 'text-sky-500',
    title: 'text-sky-900',
  },
}

export default function AlertsPanel({ alerts, title = 'Alertas', emptyMessage = 'Nenhum alerta no momento.' }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold text-emerald-900">{title}</div>
          <div className="text-xs text-emerald-700">{emptyMessage}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        {title}
        <span className="text-xs text-slate-500 font-normal">({alerts.length})</span>
      </div>
      <div className="space-y-2">
        {alerts.map(a => {
          const styles = SEVERITY_STYLE[a.severity]
          return (
            <div key={a.id} className={cn('border rounded-xl p-3 flex items-start gap-3', styles.wrapper)}>
              <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', styles.icon)} />
              <div className="flex-1 min-w-0">
                <div className={cn('text-sm font-semibold', styles.title)}>{a.title}</div>
                {a.description && <div className="text-xs text-slate-600 mt-0.5">{a.description}</div>}
              </div>
              {a.action && (
                <button
                  onClick={a.action.onClick}
                  className="text-xs font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2 flex-shrink-0"
                >
                  {a.action.label}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
