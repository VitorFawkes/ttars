import { useState } from 'react'
import { ChevronDown, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTypeDisplay } from '@/lib/notificationTypeRegistry'
import type { Notification } from '@/hooks/useNotifications'
import NotificationItem from './NotificationItem'

interface NotificationGroupProps {
    typeKey: string
    notifications: Notification[]
    onMarkGroupAsRead: (ids: string[]) => void
    onNotificationClick: (notification: Notification) => void
}

export default function NotificationGroup({
    typeKey,
    notifications,
    onMarkGroupAsRead,
    onNotificationClick,
}: NotificationGroupProps) {
    const [isOpen, setIsOpen] = useState(true)
    const typeDisplay = getTypeDisplay(typeKey)
    const Icon = typeDisplay.icon
    const [textColor, bgColor] = typeDisplay.color.split(' ')
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    const unreadCount = unreadIds.length

    return (
        <div className="border-b border-slate-100 last:border-b-0">
            {/* Group header */}
            <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50/50 transition-colors">
                <button
                    type="button"
                    onClick={() => setIsOpen(prev => !prev)}
                    className="flex items-center gap-2.5 flex-1 min-w-0"
                >
                    <div className={cn('p-1.5 rounded-lg', bgColor)}>
                        <Icon className={cn('w-3.5 h-3.5', textColor)} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 truncate">
                        {typeDisplay.label}
                    </span>
                    {unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                            {unreadCount}
                        </span>
                    )}
                    <span className="text-[11px] text-slate-400">
                        {notifications.length}
                    </span>
                    <ChevronDown className={cn(
                        'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                        isOpen && 'rotate-180'
                    )} />
                </button>
                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={() => onMarkGroupAsRead(unreadIds)}
                        title="Marcar grupo como lido"
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Collapsible body */}
            <div
                className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-in-out',
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
            >
                <div className="overflow-hidden">
                    <div className="divide-y divide-slate-50">
                        {notifications.map(n => (
                            <NotificationItem
                                key={n.id}
                                notification={n}
                                onClick={() => onNotificationClick(n)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
