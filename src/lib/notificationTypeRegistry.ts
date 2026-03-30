import { UserCheck, FileSpreadsheet, Bell, type LucideIcon } from 'lucide-react'

export function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}

export interface NotificationTypeDisplay {
    icon: LucideIcon
    color: string       // 'text-{color}-600 bg-{color}-50'
    label: string
    description: string
}

export const NOTIFICATION_TYPE_REGISTRY: Record<string, NotificationTypeDisplay> = {
    lead_assigned: {
        icon: UserCheck,
        color: 'text-indigo-600 bg-indigo-50',
        label: 'Lead Atribuído',
        description: 'Quando um card é atribuído a você',
    },
    financial_items_updated: {
        icon: FileSpreadsheet,
        color: 'text-purple-600 bg-purple-50',
        label: 'Produtos Monde',
        description: 'Quando produtos financeiros são importados via Monde',
    },
}

const FALLBACK_TYPE: NotificationTypeDisplay = {
    icon: Bell,
    color: 'text-slate-600 bg-slate-100',
    label: 'Notificação',
    description: '',
}

export function getTypeDisplay(typeKey: string): NotificationTypeDisplay {
    return NOTIFICATION_TYPE_REGISTRY[typeKey] ?? FALLBACK_TYPE
}
