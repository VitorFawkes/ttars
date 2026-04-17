import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
    title: string
    value: string | number
    icon: LucideIcon
    color?: string
    bgColor?: string
    subtitle?: string
    isLoading?: boolean
    onClick?: () => void
    clickHint?: string
}

export default function KpiCard({
    title,
    value,
    icon: Icon,
    color = 'text-indigo-600',
    bgColor = 'bg-indigo-50',
    subtitle,
    isLoading,
    onClick,
    clickHint,
}: KpiCardProps) {
    if (isLoading) {
        return (
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-100" />
                    <div className="flex-1">
                        <div className="h-3 w-20 bg-slate-100 rounded mb-2" />
                        <div className="h-6 w-16 bg-slate-100 rounded" />
                    </div>
                </div>
            </div>
        )
    }

    const Wrapper = onClick ? 'button' : 'div'

    return (
        <Wrapper
            onClick={onClick}
            className={cn(
                'bg-white border border-slate-200 shadow-sm rounded-xl p-5 text-left w-full',
                onClick && 'hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group'
            )}
        >
            <div className="flex items-center gap-4">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bgColor)}>
                    <Icon className={cn('w-5 h-5', color)} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-500 truncate">{title}</p>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
                    )}
                    {clickHint && (
                        <p className="text-[10px] text-indigo-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{clickHint}</p>
                    )}
                </div>
            </div>
        </Wrapper>
    )
}
