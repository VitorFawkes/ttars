import { DollarSign, Hash, Percent, TrendingUp } from 'lucide-react'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

function getKpiIcon(format: string | undefined) {
    switch (format) {
        case 'currency': return DollarSign
        case 'percent': return Percent
        case 'number': return Hash
        default: return TrendingUp
    }
}

const KPI_COLORS = [
    { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { bg: 'bg-amber-50', text: 'text-amber-600' },
    { bg: 'bg-rose-50', text: 'text-rose-600' },
    { bg: 'bg-cyan-50', text: 'text-cyan-600' },
    { bg: 'bg-purple-50', text: 'text-purple-600' },
]

export default function KpiRenderer({
    data,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
    keyFormats,
    onDrillDown,
}: ChartRendererProps) {
    if (!data.length || !measureKeys.length) {
        return (
            <div className="flex items-center justify-center h-[140px] text-slate-400 text-sm">
                Nenhum registro encontrado
            </div>
        )
    }

    const row = data[0]

    return (
        <div className="flex flex-wrap gap-4 justify-center py-4 px-2">
            {measureKeys.map((key, idx) => {
                const value = Number(row[key] ?? 0)
                const format = keyFormats?.[key] ?? labelFormat
                const formatted = autoFormat(value, format)
                const Icon = getKpiIcon(format)
                const color = KPI_COLORS[idx % KPI_COLORS.length]
                const textSize = formatted.length > 12 ? 'text-xl' : 'text-2xl'
                const canDrill = onDrillDown && dimensionKeys.length > 0

                return (
                    <div
                        key={key}
                        className={`flex-1 min-w-[140px] max-w-[220px] bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-colors ${canDrill ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''}`}
                        onClick={() => {
                            if (canDrill) {
                                const filters: Record<string, unknown> = {}
                                for (const dk of dimensionKeys) {
                                    if (row[dk] != null) filters[dk] = row[dk]
                                }
                                if (Object.keys(filters).length > 0) onDrillDown!(filters)
                            }
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
                                <Icon className={`w-4 h-4 ${color.text}`} />
                            </div>
                        </div>
                        <div className={`${textSize} font-bold tracking-tight text-slate-900`}>
                            {formatted}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 font-medium">
                            {labels?.[key] ?? key}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
