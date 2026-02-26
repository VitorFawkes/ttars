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

function getKpiColor(format: string | undefined) {
    switch (format) {
        case 'currency': return { bg: 'bg-emerald-50', text: 'text-emerald-600' }
        case 'percent': return { bg: 'bg-amber-50', text: 'text-amber-600' }
        default: return { bg: 'bg-indigo-50', text: 'text-indigo-600' }
    }
}

export default function KpiRenderer({
    data,
    measureKeys,
    labels,
    labelFormat,
    keyFormats,
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
            {measureKeys.map((key) => {
                const value = Number(row[key] ?? 0)
                const format = keyFormats?.[key] ?? labelFormat
                const formatted = autoFormat(value, format)
                const Icon = getKpiIcon(format)
                const color = getKpiColor(format)
                const textSize = formatted.length > 12 ? 'text-xl' : 'text-2xl'

                return (
                    <div
                        key={key}
                        className="flex-1 min-w-[140px] max-w-[220px] bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
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
