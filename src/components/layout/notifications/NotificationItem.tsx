import { cn } from '@/lib/utils'
import { getTypeDisplay, formatTimeAgo } from '@/lib/notificationTypeRegistry'
import type { Notification } from '@/hooks/useNotifications'

interface NotificationItemProps {
    notification: Notification
    onClick: () => void
}

export default function NotificationItem({ notification, onClick }: NotificationItemProps) {
    const typeDisplay = getTypeDisplay(notification.type)
    const Icon = typeDisplay.icon
    const [textColor] = typeDisplay.color.split(' ')

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors',
                !notification.read && 'bg-indigo-50/40'
            )}
        >
            <div className="flex gap-3">
                <div className={cn('mt-0.5 shrink-0', textColor)}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className={cn(
                            'text-sm text-slate-900 leading-snug truncate',
                            !notification.read && 'font-semibold'
                        )}>
                            {notification.title}
                        </p>
                        <span className="text-[11px] text-slate-400 shrink-0">
                            {formatTimeAgo(notification.created_at)}
                        </span>
                    </div>
                    {notification.body && (
                        <p className="text-xs text-slate-500 leading-snug line-clamp-2">
                            {notification.body}
                        </p>
                    )}
                </div>
                {!notification.read && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                )}
            </div>
        </button>
    )
}
