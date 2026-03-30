import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useState } from 'react'
import { useHealthAlerts } from '@/hooks/useIntegrationHealth'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'
import NotificationDrawer from './notifications/NotificationDrawer'

export default function NotificationCenter({ triggerClassName }: { triggerClassName?: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const { profile } = useAuth()
    const { data: alerts } = useHealthAlerts(false)
    const { unreadCount: notifUnreadCount } = useNotifications()

    const isAdmin = profile?.is_admin === true
    const alertUnreadCount = isAdmin ? (alerts?.filter(a => a.status === 'active').length ?? 0) : 0
    const totalUnread = notifUnreadCount + alertUnreadCount
    const hasCritical = isAdmin && (alerts?.some(a => a.rule?.severity === 'critical') ?? false)

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className={cn('relative text-gray-500 hover:text-gray-700', triggerClassName)}
                onClick={() => setIsOpen(true)}
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

            <NotificationDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    )
}
