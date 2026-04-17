import { cn } from '@/lib/utils'
import { formatCurrency } from '@/utils/whatsappFormatters'

interface PhaseSummaryCardProps {
    label: string
    color: string
    cardCount: number
    totalValue: number
    avgDays: number
    isActive: boolean
    onClick: () => void
}

export default function PhaseSummaryCard({
    label,
    color,
    cardCount,
    totalValue,
    avgDays,
    isActive,
    onClick,
}: PhaseSummaryCardProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'bg-white border shadow-sm rounded-xl px-4 py-3 text-left w-full transition-all',
                isActive
                    ? 'border-indigo-400 ring-1 ring-indigo-400 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow'
            )}
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs font-semibold text-slate-700">{label}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold text-slate-800 text-sm tabular-nums">{cardCount}</span>
                <span className="text-slate-300">·</span>
                <span className="tabular-nums">{formatCurrency(totalValue)}</span>
                <span className="text-slate-300">·</span>
                <span className="tabular-nums">{avgDays}d média</span>
            </div>
        </button>
    )
}
