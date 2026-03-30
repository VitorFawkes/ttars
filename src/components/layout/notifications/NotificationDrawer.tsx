import { useState } from 'react'
import { Bell, CheckCheck, AlertCircle, AlertTriangle, Info, ArrowUpRight, Building2, MessageSquare, Timer, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNotifications, type Notification } from '@/hooks/useNotifications'
import { useHealthAlerts, type HealthAlert } from '@/hooks/useIntegrationHealth'
import { useAuth } from '@/contexts/AuthContext'
import { NOTIFICATION_TYPE_REGISTRY, formatTimeAgo } from '@/lib/notificationTypeRegistry'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import NotificationGroup from './NotificationGroup'

// ═══════════════════════════════════════════════════════════
// Health Alerts (kept from original NotificationCenter)
// ═══════════════════════════════════════════════════════════

const SEVERITY_ICON = {
    critical: { icon: AlertCircle,   color: 'text-red-500' },
    warning:  { icon: AlertTriangle, color: 'text-amber-500' },
    info:     { icon: Info,          color: 'text-blue-500' },
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    whatsapp:       { label: 'WhatsApp',       icon: MessageSquare, color: 'text-green-600 bg-green-50' },
    activecampaign: { label: 'ActiveCampaign', icon: Zap,           color: 'text-blue-600 bg-blue-50' },
    outbound:       { label: 'Outbound',       icon: ArrowUpRight,  color: 'text-indigo-600 bg-indigo-50' },
    monde:          { label: 'Monde',          icon: Building2,     color: 'text-purple-600 bg-purple-50' },
    system:         { label: 'Sistema',        icon: Timer,         color: 'text-slate-600 bg-slate-100' },
}

function alertSummary(alert: HealthAlert): string {
    const ctx = alert.context
    if (ctx.hours_since != null && ctx.threshold_hours != null) {
        const h = Number(ctx.hours_since)
        if (h >= 24) return `${Math.floor(h / 24)} dia(s) sem atividade`
        return `${ctx.hours_since}h sem atividade (limite: ${ctx.threshold_hours}h)`
    }
    if (ctx.stuck_pending_count != null || ctx.stuck_count != null) {
        return `${ctx.stuck_pending_count ?? ctx.stuck_count} itens parados`
    }
    if (ctx.overdue_count != null) return `${ctx.overdue_count} itens atrasados`
    if (ctx.failed_count != null) return `${ctx.failed_count} falhas recentes`
    return 'Atenção necessária'
}

function AlertItem({ alert, onNavigate }: { alert: HealthAlert; onNavigate: () => void }) {
    const severity = (alert.rule?.severity ?? 'warning') as keyof typeof SEVERITY_ICON
    const config = SEVERITY_ICON[severity]
    const Icon = config.icon
    const isUnread = alert.status === 'active'
    const category = CATEGORY_CONFIG[alert.rule?.category ?? '']

    return (
        <button type="button" onClick={onNavigate} className={cn('w-full text-left p-3 hover:bg-slate-50 transition-colors', isUnread && 'bg-blue-50/50')}>
            <div className="flex gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {category && <span className={cn('text-[9px] font-bold px-1.5 py-0 rounded', category.color)}>{category.label}</span>}
                        <span className="text-[11px] text-slate-400 ml-auto">{formatTimeAgo(alert.fired_at)}</span>
                    </div>
                    <p className={cn('text-sm text-slate-900 leading-snug', isUnread && 'font-semibold')}>{alert.rule?.label ?? alert.rule_key}</p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">{alertSummary(alert)}</p>
                </div>
                {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
            </div>
        </button>
    )
}

// ═══════════════════════════════════════════════════════════
// Notification Drawer
// ═══════════════════════════════════════════════════════════

type Tab = 'notifications' | 'alerts'
type Filter = 'all' | 'unread'

interface NotificationDrawerProps {
    isOpen: boolean
    onClose: () => void
}

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
    const [activeTab, setActiveTab] = useState<Tab>('notifications')
    const [filter, setFilter] = useState<Filter>('all')
    const navigate = useNavigate()
    const { profile } = useAuth()
    const { notifications, unreadCount, markAsRead, markGroupAsRead, markAllAsRead } = useNotifications()
    const { data: alerts } = useHealthAlerts(false)

    const isAdmin = profile?.is_admin === true
    const alertUnreadCount = alerts?.filter(a => a.status === 'active').length ?? 0

    // Apply filter
    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.read)
        : notifications

    // Re-group filtered notifications
    const filteredGroups: Record<string, Notification[]> = {}
    for (const n of filteredNotifications) {
        if (!filteredGroups[n.type]) filteredGroups[n.type] = []
        filteredGroups[n.type].push(n)
    }

    // Sort groups: types with unread first, then by registry order
    const typeOrder = Object.keys(NOTIFICATION_TYPE_REGISTRY)
    const sortedGroupKeys = Object.keys(filteredGroups).sort((a, b) => {
        const aUnread = filteredGroups[a].some(n => !n.read) ? 0 : 1
        const bUnread = filteredGroups[b].some(n => !n.read) ? 0 : 1
        if (aUnread !== bUnread) return aUnread - bUnread
        return (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) - (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b))
    })

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.read) {
            markAsRead.mutate(notification.id)
        }
        if (notification.url) {
            onClose()
            navigate(notification.url)
        }
    }

    const handleNavigateToHealth = () => {
        onClose()
        navigate('/settings/operations/health?tab=integrations')
    }

    return (
        <Sheet open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">Notificações</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Acompanhe as atualizações dos seus cards</p>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 px-5">
                    <button
                        type="button"
                        onClick={() => setActiveTab('notifications')}
                        className={cn(
                            'px-3 py-2 text-sm font-medium transition-colors relative',
                            activeTab === 'notifications' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        Notificações
                        {unreadCount > 0 && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                                {unreadCount}
                            </span>
                        )}
                        {activeTab === 'notifications' && (
                            <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-600 rounded-full" />
                        )}
                    </button>
                    {isAdmin && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('alerts')}
                            className={cn(
                                'px-3 py-2 text-sm font-medium transition-colors relative',
                                activeTab === 'alerts' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
                            )}
                        >
                            Alertas
                            {alertUnreadCount > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                                    {alertUnreadCount}
                                </span>
                            )}
                            {activeTab === 'alerts' && (
                                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-600 rounded-full" />
                            )}
                        </button>
                    )}
                </div>

                {/* Filter bar (notifications tab only) */}
                {activeTab === 'notifications' && (
                    <div className="flex items-center gap-1 px-5 py-2 border-b border-slate-50">
                        {(['all', 'unread'] as const).map(f => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                className={cn(
                                    'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                    filter === f
                                        ? 'bg-slate-900 text-white'
                                        : 'text-slate-500 hover:bg-slate-100'
                                )}
                            >
                                {f === 'all' ? 'Todas' : `Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'notifications' ? (
                        sortedGroupKeys.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-6">
                                {filter === 'unread' ? (
                                    <>
                                        <CheckCheck className="h-10 w-10 text-emerald-300 mb-3" />
                                        <p className="text-sm font-medium text-slate-700">Tudo em dia!</p>
                                        <p className="text-xs text-slate-400 mt-1">Nenhuma notificação não lida</p>
                                    </>
                                ) : (
                                    <>
                                        <Bell className="h-10 w-10 text-slate-200 mb-3" />
                                        <p className="text-sm font-medium text-slate-500">Nenhuma notificação</p>
                                        <p className="text-xs text-slate-400 mt-1">Quando houver atualizações, elas aparecerão aqui</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div>
                                {sortedGroupKeys.map(typeKey => (
                                    <NotificationGroup
                                        key={typeKey}
                                        typeKey={typeKey}
                                        notifications={filteredGroups[typeKey]}
                                        onMarkGroupAsRead={(ids) => markGroupAsRead.mutate(ids)}
                                        onNotificationClick={handleNotificationClick}
                                    />
                                ))}
                            </div>
                        )
                    ) : (
                        !alerts?.length ? (
                            <div className="flex flex-col items-center justify-center py-16 px-6">
                                <CheckCheck className="h-10 w-10 text-emerald-300 mb-3" />
                                <p className="text-sm font-medium text-slate-500">Integrações funcionando</p>
                                <p className="text-xs text-slate-400 mt-1">Nenhum alerta ativo</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {alerts.map(alert => (
                                    <AlertItem key={alert.id} alert={alert} onNavigate={handleNavigateToHealth} />
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                {activeTab === 'notifications' && unreadCount > 0 && (
                    <div className="border-t border-slate-100 p-3 flex justify-center">
                        <button
                            type="button"
                            onClick={() => markAllAsRead.mutate()}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Marcar todas como lidas
                        </button>
                    </div>
                )}
                {activeTab === 'alerts' && (alerts?.length ?? 0) > 0 && (
                    <div className="border-t border-slate-100 p-3 flex justify-center">
                        <button
                            type="button"
                            onClick={handleNavigateToHealth}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium py-1.5"
                        >
                            Ver todos os detalhes
                        </button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
