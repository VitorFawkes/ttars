import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useState } from 'react'
import { useHealthAlerts } from '@/hooks/useIntegrationHealth'
import { useNotifications, NOTIFICATION_NEW_EVENT } from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'
import NotificationDrawer from './notifications/NotificationDrawer'

interface NotificationCenterProps {
    className?: string
    showLabel?: boolean
    label?: string
}

export default function NotificationCenter({ className, showLabel, label = 'Notificações' }: NotificationCenterProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [bouncing, setBouncing] = useState(false)
    const { profile } = useAuth()
    const { data: alerts } = useHealthAlerts(false)
    const { unreadCount: notifUnreadCount, updateBaseline } = useNotifications()

    const isAdmin = profile?.is_admin === true
    const alertUnreadCount = isAdmin ? (alerts?.filter(a => a.status === 'active').length ?? 0) : 0
    const totalUnread = notifUnreadCount + alertUnreadCount
    const hasCritical = isAdmin && (alerts?.some(a => a.rule?.severity === 'critical') ?? false)

    // Listen for new notification events from the realtime subscription
    const handleNewNotification = useCallback(() => {
        setIsOpen(true)
        setBouncing(true)
        setTimeout(() => setBouncing(false), 2000)
    }, [])

    useEffect(() => {
        window.addEventListener(NOTIFICATION_NEW_EVENT, handleNewNotification)
        return () => window.removeEventListener(NOTIFICATION_NEW_EVENT, handleNewNotification)
    }, [handleNewNotification])

    const handleClose = () => {
        setIsOpen(false)
        updateBaseline()
    }

    return (
        <>
            <button
                type="button"
                className={cn(
                    'relative flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    totalUnread > 0
                        ? 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 hover:text-indigo-200'
                        : 'text-primary-light hover:bg-primary hover:text-white',
                    className
                )}
                onClick={() => setIsOpen(true)}
            >
                <div className="relative flex-shrink-0">
                    <Bell className={cn('h-5 w-5', bouncing && 'animate-bounce')} />
                    {totalUnread > 0 && (
                        <span className={cn(
                            'absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[9px] font-bold text-white ring-2 ring-[var(--color-primary-dark)]',
                            hasCritical ? 'bg-red-500' : 'bg-indigo-500'
                        )}>
                            {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                    )}
                </div>
                {showLabel && (
                    <span className="whitespace-nowrap">
                        {label}
                    </span>
                )}
            </button>

            <NotificationDrawer isOpen={isOpen} onClose={handleClose} />
        </>
    )
}
