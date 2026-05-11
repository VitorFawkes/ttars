import { Megaphone, Loader2, Eye, EyeOff } from 'lucide-react'
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
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                >
                    <Megaphone className="h-4 w-4 text-amber-700" />
                    <h3 className="text-sm font-semibold text-amber-700">
                        Alertas
                        {unreadCount > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                                {unreadCount}
                            </span>
                        )}
                    </h3>
                </button>
                <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); markAllAsRead.mutate() }}
                            disabled={markAllAsRead.isPending}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-amber-600 hover:text-amber-800 hover:bg-amber-100 font-medium transition-colors"
                        >
                            <Eye className="h-3 w-3" />
                            Visto
                        </button>
                    )}
                    {onToggleCollapse && (
                        <SectionCollapseToggle isExpanded={!!isExpanded} onToggle={onToggleCollapse} />
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="p-3 space-y-1.5">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    ) : alerts.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">
                            Nenhum alerta neste card
                        </p>
                    ) : (
                        <div className="max-h-[300px] overflow-y-auto space-y-1">
                            {alerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className={cn(
                                        'group flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-all',
                                        alert.read
                                            ? 'bg-white opacity-60'
                                            : 'bg-amber-50/50 border border-amber-100'
                                    )}
                                >
                                    {/* Conteúdo */}
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            'text-sm leading-tight',
                                            alert.read ? 'text-slate-500' : 'text-slate-900 font-medium'
                                        )}>
                                            {alert.title}
                                        </p>
                                        {alert.body && (
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                {alert.body}
                                            </p>
                                        )}
                                        <span className="text-[11px] text-slate-400 mt-1 block">
                                            {timeAgo(alert.created_at)}
                                        </span>
                                    </div>

                                    {/* Ação: Marcar como visto / Já visto */}
                                    <div className="flex-shrink-0 mt-0.5">
                                        {!alert.read ? (
                                            <button
                                                onClick={() => markAsRead.mutate(alert.id)}
                                                disabled={markAsRead.isPending}
                                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-200 transition-colors"
                                            >
                                                <Eye className="h-3 w-3" />
                                                Visto
                                            </button>
                                        ) : (
                                            <span className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400">
                                                <EyeOff className="h-3 w-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
