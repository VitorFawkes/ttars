import { Megaphone, Loader2, Check, CheckCheck } from 'lucide-react'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useCardAlerts } from '@/hooks/useCardAlerts'
import { cn } from '@/lib/utils'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface AlertsWidgetProps {
    cardId: string
    card: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
}

export default function AlertsWidget({ cardId, isExpanded, onToggleCollapse }: AlertsWidgetProps) {
    const { alerts, isLoading, unreadCount, markAsRead, markAllAsRead } = useCardAlerts(cardId)

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-amber-50">
                <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-amber-700" />
                    <h3 className="text-sm font-semibold text-amber-700">
                        Alertas
                        {unreadCount > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                                {unreadCount}
                            </span>
                        )}
                    </h3>
                </div>
                {onToggleCollapse && (
                    <SectionCollapseToggle isExpanded={!!isExpanded} onToggle={onToggleCollapse} />
                )}
            </div>

            {isExpanded && (
                <div className="p-3 space-y-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    ) : alerts.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">
                            Nenhum alerta para este card
                        </p>
                    ) : (
                        <>
                            {/* Marcar tudo como lido */}
                            {unreadCount > 0 && (
                                <button
                                    onClick={() => markAllAsRead.mutate()}
                                    disabled={markAllAsRead.isPending}
                                    className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-800 font-medium mb-1"
                                >
                                    <CheckCheck className="h-3 w-3" />
                                    Marcar tudo como lido
                                </button>
                            )}

                            {/* Lista de alertas */}
                            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                                {alerts.map(alert => (
                                    <div
                                        key={alert.id}
                                        className={cn(
                                            'flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors',
                                            alert.read
                                                ? 'bg-white'
                                                : 'bg-amber-50/60'
                                        )}
                                    >
                                        {/* Dot indicador */}
                                        <div className="mt-1.5 flex-shrink-0">
                                            <div className={cn(
                                                'h-2 w-2 rounded-full',
                                                alert.read ? 'bg-slate-300' : 'bg-amber-500'
                                            )} />
                                        </div>

                                        {/* Conteúdo */}
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                'text-sm leading-tight',
                                                alert.read ? 'text-slate-600' : 'text-slate-900 font-medium'
                                            )}>
                                                {alert.title}
                                            </p>
                                            {alert.body && (
                                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                    {alert.body}
                                                </p>
                                            )}
                                            <span className="text-[11px] text-slate-400 mt-0.5 block">
                                                {timeAgo(alert.created_at)}
                                            </span>
                                        </div>

                                        {/* Botão marcar como lido */}
                                        {!alert.read && (
                                            <button
                                                onClick={() => markAsRead.mutate(alert.id)}
                                                disabled={markAsRead.isPending}
                                                className="flex-shrink-0 mt-0.5 p-1 rounded hover:bg-amber-100 text-amber-600 hover:text-amber-800 transition-colors"
                                                title="Marcar como lido"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
