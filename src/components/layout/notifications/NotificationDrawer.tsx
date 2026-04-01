import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNotifications, type Notification } from '@/hooks/useNotifications'
import { NOTIFICATION_TYPE_REGISTRY } from '@/lib/notificationTypeRegistry'
import NotificationGroup from './NotificationGroup'

// ═══════════════════════════════════════════════════════════
// Tipos por aba
// ═══════════════════════════════════════════════════════════

// Alertas = card_alert + financial_items_updated
const ALERT_TYPES = new Set(['card_alert', 'financial_items_updated'])

// Notificações = tudo que NÃO é alerta (lead_assigned, etc.)
function isAlertType(type: string) {
    return ALERT_TYPES.has(type)
}

// ═══════════════════════════════════════════════════════════
// Notification Panel (expanding box from bottom-right)
// ═══════════════════════════════════════════════════════════

type Tab = 'notifications' | 'alerts'
type Filter = 'all' | 'unread'

interface NotificationDrawerProps {
    isOpen: boolean
    onClose: () => void
    positionStyle?: React.CSSProperties
}

export default function NotificationDrawer({ isOpen, onClose, positionStyle }: NotificationDrawerProps) {
    const [activeTab, setActiveTab] = useState<Tab>('notifications')
    const [filter, setFilter] = useState<Filter>('all')
    const navigate = useNavigate()
    const { notifications, markAsRead, markGroupAsRead } = useNotifications()
    const panelRef = useRef<HTMLDivElement>(null)

    // Split notifications by tab
    const notifItems = notifications.filter(n => !isAlertType(n.type))
    const alertItems = notifications.filter(n => isAlertType(n.type))

    const notifUnreadCount = notifItems.filter(n => !n.read).length
    const alertUnreadCount = alertItems.filter(n => !n.read).length

    const currentItems = activeTab === 'notifications' ? notifItems : alertItems
    const currentUnreadCount = activeTab === 'notifications' ? notifUnreadCount : alertUnreadCount

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen, onClose])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    // Apply filter to current tab items
    const filteredItems = filter === 'unread'
        ? currentItems.filter(n => !n.read)
        : currentItems

    // Group by type
    const filteredGroups: Record<string, Notification[]> = {}
    for (const n of filteredItems) {
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

    const handleMarkAllCurrentAsRead = () => {
        const unreadIds = currentItems.filter(n => !n.read).map(n => n.id)
        if (unreadIds.length > 0) {
            markGroupAsRead.mutate(unreadIds)
        }
    }

    const emptyLabel = activeTab === 'notifications'
        ? { title: 'Nenhuma notificação', subtitle: 'Quando houver atualizações, elas aparecerão aqui' }
        : { title: 'Nenhum alerta', subtitle: 'Alertas de cards e produtos aparecerão aqui' }

    return (
        <div
            ref={panelRef}
            style={positionStyle}
            className={cn(
                'fixed z-50 w-[400px] max-h-[min(600px,calc(100vh-80px))] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden',
                'transition-all duration-300 ease-out origin-bottom-right',
                !positionStyle && 'bottom-6 right-6',
                isOpen
                    ? 'scale-100 opacity-100 translate-y-0'
                    : 'scale-95 opacity-0 translate-y-2 pointer-events-none'
            )}
        >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">Notificações</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Acompanhe as atualizações dos seus cards</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
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
                    {notifUnreadCount > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                            {notifUnreadCount}
                        </span>
                    )}
                    {activeTab === 'notifications' && (
                        <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-600 rounded-full" />
                    )}
                </button>
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
            </div>

            {/* Filter bar */}
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
                        {f === 'all' ? 'Todas' : `Não lidas${currentUnreadCount > 0 ? ` (${currentUnreadCount})` : ''}`}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {sortedGroupKeys.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6">
                        {filter === 'unread' ? (
                            <>
                                <CheckCheck className="h-10 w-10 text-emerald-300 mb-3" />
                                <p className="text-sm font-medium text-slate-700">Tudo em dia!</p>
                                <p className="text-xs text-slate-400 mt-1">Nenhuma notificação não lida</p>
                            </>
                        ) : (
                            <>
                                <Bell className="h-10 w-10 text-slate-200 mb-3" />
                                <p className="text-sm font-medium text-slate-500">{emptyLabel.title}</p>
                                <p className="text-xs text-slate-400 mt-1">{emptyLabel.subtitle}</p>
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
                                onMarkAsRead={(id) => markAsRead.mutate(id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            {currentUnreadCount > 0 && (
                <div className="border-t border-slate-100 p-3 flex justify-center">
                    <button
                        type="button"
                        onClick={handleMarkAllCurrentAsRead}
                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 px-3 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Marcar todas como lidas
                    </button>
                </div>
            )}
        </div>
    )
}
