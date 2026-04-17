import { FileText, Send, CheckCircle, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProposalStatus } from '@/types/proposals'

interface ProposalStatsBarProps {
    total: number
    sent: number
    accepted: number
    conversionRate: number
    onStatusClick: (status: ProposalStatus | null) => void
    activeStatus: ProposalStatus | null
}

export function ProposalStatsBar({
    total,
    sent,
    accepted,
    conversionRate,
    onStatusClick,
    activeStatus,
}: ProposalStatsBarProps) {
    const stats = [
        {
            label: 'Total de Propostas',
            value: total,
            icon: FileText,
            color: 'from-blue-500 to-blue-600',
            textColor: 'text-blue-600',
            bgColor: 'bg-blue-50',
            status: null,
        },
        {
            label: 'Enviadas',
            value: sent,
            icon: Send,
            color: 'from-purple-500 to-purple-600',
            textColor: 'text-purple-600',
            bgColor: 'bg-purple-50',
            status: 'sent' as ProposalStatus,
        },
        {
            label: 'Aceitas',
            value: accepted,
            icon: CheckCircle,
            color: 'from-green-500 to-green-600',
            textColor: 'text-green-600',
            bgColor: 'bg-green-50',
            status: 'accepted' as ProposalStatus,
        },
        {
            label: 'Taxa de Conversão',
            value: `${conversionRate}%`,
            icon: TrendingUp,
            color: 'from-amber-500 to-amber-600',
            textColor: 'text-amber-600',
            bgColor: 'bg-amber-50',
            status: null,
            isPercentage: true,
        },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon
                const isActive = activeStatus === stat.status && stat.status !== null
                const isClickable = stat.status !== null || (stat.status === null && !stat.isPercentage)

                return (
                    <button
                        key={stat.label}
                        onClick={() => isClickable && onStatusClick(isActive ? null : stat.status)}
                        disabled={stat.isPercentage}
                        className={cn(
                            "relative overflow-hidden rounded-xl p-4 text-left transition-all duration-200",
                            "bg-white border shadow-sm hover:shadow-md",
                            isActive ? "ring-2 ring-primary border-primary" : "border-gray-200",
                            stat.isPercentage && "cursor-default"
                        )}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                    {stat.label}
                                </p>
                                <p className={cn("text-2xl font-bold mt-1", stat.textColor)}>
                                    {stat.value}
                                </p>
                            </div>
                            <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                                <Icon className={cn("h-5 w-5", stat.textColor)} />
                            </div>
                        </div>
                        {isActive && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary-dark" />
                        )}
                    </button>
                )
            })}
        </div>
    )
}
