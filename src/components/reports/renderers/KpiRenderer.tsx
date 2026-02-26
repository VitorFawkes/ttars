import { TrendingUp } from 'lucide-react'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

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
                Sem dados
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

                return (
                    <div
                        key={key}
                        className="flex-1 min-w-[140px] max-w-[220px] bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-indigo-600" />
                            </div>
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-slate-900">
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
