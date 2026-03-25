import { Bell, AlertCircle, AlertTriangle, Info, MessageSquare, Zap, ArrowUpRight, Building2, Timer, UserCheck, CheckCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHealthAlerts, type HealthAlert } from '@/hooks/useIntegrationHealth'
import { useNotifications, type Notification } from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'

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

const NOTIFICATION_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    lead_assigned: { icon: UserCheck, color: 'text-indigo-600 bg-indigo-50', label: 'Lead' },
}

function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
}

function alertSummary(alert: HealthAlert): string {
    const ctx = alert.context
    if (ctx.hours_since != null && ctx.threshold_hours != null) {
        const h = Number(ctx.hours_since)
        if (h >= 24) {
            const days = Math.floor(h / 24)
            return `${days} dia${days > 1 ? 's' : ''} sem atividade (limite: ${ctx.threshold_hours}h)`
        }
        return `${ctx.hours_since}h sem atividade (limite: ${ctx.threshold_hours}h)`
    }
    if (ctx.stuck_pending_count != null || ctx.stuck_count != null) {
        const count = ctx.stuck_pending_count ?? ctx.stuck_count
        return `${count} itens parados ha ${ctx.threshold_hours ?? '?'}h+`
    }
    if (ctx.overdue_count != null) {
        return `${ctx.overdue_count} itens atrasados na fila`
    }
    if (ctx.failed_count != null && ctx.error_rate_percent != null) {
        return `${ctx.failed_count} falhas (${ctx.error_rate_percent}% de erro)`
    }
    if (ctx.failed_count != null) {
        return `${ctx.failed_count} falhas recentes`
    }
    return 'Atencao necessaria'
}

function alertDetail(alert: HealthAlert): string | null {
    const ctx = alert.context
    if (ctx.last_event_at) {
        const d = new Date(String(ctx.last_event_at))
        return `Ultimo: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    }
    return null
}

function AlertItem({ alert, onNavigate }: { alert: HealthAlert; onNavigate: () => void }) {
    const severity = (alert.rule?.severity ?? 'warning') as keyof typeof SEVERITY_ICON
    const config = SEVERITY_ICON[severity]
    const Icon = config.icon
    const isUnread = alert.status === 'active'
    const category = CATEGORY_CONFIG[alert.rule?.category ?? '']
    const detail = alertDetail(alert)

    return (
        <div
            className={cn(
                'p-3 hover:bg-slate-50 transition-colors cursor-pointer',
                isUnread && 'bg-blue-50/50'
            )}
            onClick={onNavigate}
        >
            <div className="flex gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {category && (
                            <span className={cn('text-[9px] font-bold px-1.5 py-0 rounded', category.color)}>
                                {category.label}
                            </span>
                        )}
                        <span className="text-[11px] text-slate-400 ml-auto">
                            {formatTimeAgo(alert.fired_at)}
                        </span>
                    </div>
                    <p className={cn('text-sm text-slate-900 leading-snug', isUnread && 'font-semibold')}>
                        {alert.rule?.label ?? alert.rule_key}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                        {alertSummary(alert)}
                    </p>
                    {detail && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {detail}
                        </p>
                    )}
                </div>
                {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                )}
            </div>
        </div>
    )
}

function NotificationItem({ notification, onNavigate }: { notification: Notification; onNavigate: (url: string) => void }) {
    const typeConfig = NOTIFICATION_TYPE_CONFIG[notification.type] || NOTIFICATION_TYPE_CONFIG.lead_assigned
    const Icon = typeConfig.icon

    return (
        <div
            className={cn(
                'p-3 hover:bg-slate-50 transition-colors cursor-pointer',
                !notification.read && 'bg-indigo-50/50'
            )}
            onClick={() => notification.url && onNavigate(notification.url)}
        >
            <div className="flex gap-2.5">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', typeConfig.color.split(' ')[0])} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn('text-[9px] font-bold px-1.5 py-0 rounded', typeConfig.color)}>
                            {typeConfig.label}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-auto">
                            {formatTimeAgo(notification.created_at)}
                        </span>
                    </div>
                    <p className={cn('text-sm text-slate-900 leading-snug', !notification.read && 'font-semibold')}>
                        {notification.title}
                    </p>
                    {notification.body && (
                        <p className="text-xs text-slate-600 mt-0.5 leading-snug line-clamp-2">
                            {notification.body}
                        </p>
                    )}
                </div>
                {!notification.read && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                )}
            </div>
        </div>
    )
}

type Tab = 'notifications' | 'alerts'

export default function NotificationCenter({ triggerClassName }: { triggerClassName?: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>('notifications')
    const navigate = useNavigate()
    const { profile } = useAuth()
    const { data: alerts } = useHealthAlerts(false)
    const { notifications, unreadCount: notifUnreadCount, markAsRead, markAllAsRead } = useNotifications()

    const alertUnreadCount = alerts?.filter(a => a.status === 'active').length ?? 0
    const totalUnread = notifUnreadCount + alertUnreadCount
    const hasCritical = alerts?.some(a => a.rule?.severity === 'critical') ?? false
    const isAdmin = profile?.is_admin === true

    const handleNavigateToHealth = () => {
        setIsOpen(false)
        navigate('/settings/operations/health?tab=integrations')
    }

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.read) {
            markAsRead.mutate(notification.id)
        }
        if (notification.url) {
            setIsOpen(false)
            navigate(notification.url)
        }
    }

    return (
        <div className="relative">
            <Button
                variant="ghost"
                size="icon"
                className={cn('relative text-gray-500 hover:text-gray-700', triggerClassName)}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell className="h-5 w-5" />
                {totalUnread > 0 && (
                    <span className={cn(
                        'absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white ring-2 ring-white',
                        hasCritical ? 'bg-red-500' : notifUnreadCount > 0 ? 'bg-indigo-600' : 'bg-amber-500'
                    )}>
                        {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                )}
            </Button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 bottom-full mb-2 w-96 z-50 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-100">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100">
                            <button
                                onClick={() => setActiveTab('notifications')}
                                className={cn(
                                    'flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative',
                                    activeTab === 'notifications'
                                        ? 'text-indigo-600'
                                        : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                Notificacoes
                                {notifUnreadCount > 0 && (
                                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                                        {notifUnreadCount}
                                    </span>
                                )}
                                {activeTab === 'notifications' && (
                                    <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-600 rounded-full" />
                                )}
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setActiveTab('alerts')}
                                    className={cn(
                                        'flex-1 px-4 py-2.5 text-sm font-medium transition-colors relative',
                                        activeTab === 'alerts'
                                            ? 'text-indigo-600'
                                            : 'text-slate-500 hover:text-slate-700'
                                    )}
                                >
                                    Alertas
                                    {alertUnreadCount > 0 && (
                                        <span className={cn(
                                            'ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold',
                                            hasCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                        )}>
                                            {alertUnreadCount}
                                        </span>
                                    )}
                                    {activeTab === 'alerts' && (
                                        <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-600 rounded-full" />
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="max-h-96 overflow-y-auto">
                            {activeTab === 'notifications' ? (
                                notifications.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">
                                        Nenhuma notificacao ainda.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {notifications.map(n => (
                                            <NotificationItem
                                                key={n.id}
                                                notification={n}
                                                onNavigate={() => handleNotificationClick(n)}
                                            />
                                        ))}
                                    </div>
                                )
                            ) : (
                                !alerts?.length ? (
                                    <div className="p-6 text-center text-sm text-slate-500">
                                        Nenhum alerta ativo. Integracoes funcionando.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {alerts.map(alert => (
                                            <AlertItem
                                                key={alert.id}
                                                alert={alert}
                                                onNavigate={handleNavigateToHealth}
                                            />
                                        ))}
                                    </div>
                                )
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-slate-100 p-2 flex justify-between items-center">
                            {activeTab === 'notifications' && notifUnreadCount > 0 && (
                                <button
                                    onClick={() => markAllAsRead.mutate()}
                                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 px-2"
                                >
                                    <CheckCheck className="w-3.5 h-3.5" />
                                    Marcar todas como lidas
                                </button>
                            )}
                            {activeTab === 'alerts' && (alerts?.length ?? 0) > 0 && (
                                <button
                                    onClick={handleNavigateToHealth}
                                    className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium py-1.5"
                                >
                                    Ver todos os detalhes
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
