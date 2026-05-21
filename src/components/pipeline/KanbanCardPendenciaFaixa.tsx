import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { usePendingNotifications } from '@/hooks/usePendingNotifications'

interface Props {
  cardId: string
}

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: AlertCircle, iconClass: 'text-red-600' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: AlertTriangle, iconClass: 'text-amber-600' },
  info: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', icon: Info, iconClass: 'text-sky-600' },
} as const

export function KanbanCardPendenciaFaixa({ cardId }: Props) {
  const { byChannel, byCard } = usePendingNotifications()

  // Intersect: notificações deste card que têm canal banner ativo
  const bannerIds = new Set(byChannel('banner').map((p) => p.id))
  const itens = byCard(cardId).filter((p) => bannerIds.has(p.id))

  if (itens.length === 0) return null

  const principal = itens[0] // ordenação já é por severidade asc no hook
  const cfg = SEVERITY_CONFIG[principal.severity] ?? SEVERITY_CONFIG.warning
  const Icon = cfg.icon
  const extra = itens.length - 1

  return (
    <div className={`flex items-center gap-2 ${cfg.bg} ${cfg.border} border-b ${cfg.text} px-3 py-1.5 text-xs font-medium rounded-t-md`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.iconClass}`} />
      <span className="truncate">{principal.title}</span>
      {extra > 0 && (
        <span className="shrink-0 opacity-70">e mais {extra}</span>
      )}
    </div>
  )
}
