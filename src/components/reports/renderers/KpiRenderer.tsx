import { DollarSign, Hash, Percent, TrendingUp } from 'lucide-react'
import { formatCurrencyFull, formatPercent, formatNumber } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

function KpiIcon({ format, className }: { format?: string; className: string }) {
    switch (format) {
        case 'currency': return <DollarSign className={className} />
        case 'percent': return <Percent className={className} />
        case 'number': return <Hash className={className} />
        default: return <TrendingUp className={className} />
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

    const hasDimensions = dimensionKeys.length > 0

    // Single row (aggregate KPI) — big cards
    if (data.length === 1) {
        return (
            <div className="flex flex-wrap gap-4 justify-center py-4 px-2">
                {measureKeys.map((key, idx) => (
                    <KpiCard
                        key={key}
                        measureKey={key}
                        value={Number(data[0][key] ?? 0)}
                        format={keyFormats?.[key] ?? labelFormat}
                        label={labels?.[key] ?? key}
                        colorIndex={idx}
                        size="large"
                        onClick={hasDimensions && onDrillDown ? () => {
                            const filters: Record<string, unknown> = {}
                            for (const dk of dimensionKeys) {
                                if (data[0][dk] != null) filters[dk] = data[0][dk]
                            }
                            if (Object.keys(filters).length > 0) onDrillDown(filters)
                        } : undefined}
                    />
                ))}
            </div>
        )
    }

    // Multiple rows (dimension-grouped KPI) — compact grid with dimension labels
    const rows = data.slice(0, 12) // Cap at 12 to prevent clutter
    const isSingleMeasure = measureKeys.length === 1

    return (
        <div className="space-y-3 py-3 px-2 max-h-[500px] overflow-y-auto">
            {rows.map((row, rowIdx) => {
                const dimLabel = dimensionKeys.map(k => String(row[k] ?? '')).join(' · ')
                return (
                    <div key={rowIdx} className="flex items-center gap-3">
                        {/* Dimension label */}
                        <div className="w-36 flex-shrink-0 text-xs font-medium text-slate-600 text-right truncate" title={dimLabel}>
                            {dimLabel}
                        </div>
                        {/* KPI values */}
                        <div className="flex flex-wrap gap-2 flex-1">
                            {measureKeys.map((key, idx) => (
                                <KpiCard
                                    key={key}
                                    measureKey={key}
                                    value={Number(row[key] ?? 0)}
                                    format={keyFormats?.[key] ?? labelFormat}
                                    label={isSingleMeasure ? undefined : (labels?.[key] ?? key)}
                                    colorIndex={idx}
                                    size="small"
                                    onClick={onDrillDown ? () => {
                                        const filters: Record<string, unknown> = {}
                                        for (const dk of dimensionKeys) {
                                            if (row[dk] != null) filters[dk] = row[dk]
                                        }
                                        if (Object.keys(filters).length > 0) onDrillDown(filters)
                                    } : undefined}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
            {data.length > 12 && (
                <div className="text-xs text-slate-400 text-center pt-1">
                    Mostrando 12 de {data.length} registros
                </div>
            )}
        </div>
    )
}

function KpiCard({
    measureKey,
    value,
    format,
    label,
    colorIndex,
    size,
    onClick,
}: {
    measureKey: string
    value: number
    format?: 'number' | 'currency' | 'percent'
    label?: string
    colorIndex: number
    size: 'large' | 'small'
    onClick?: () => void
}) {
    const formatted = format === 'currency' ? formatCurrencyFull(value) : format === 'percent' ? formatPercent(value) : formatNumber(value)
    const color = KPI_COLORS[colorIndex % KPI_COLORS.length]

    if (size === 'small') {
        return (
            <div
                className={`flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm ${onClick ? 'cursor-pointer hover:border-indigo-300' : ''}`}
                onClick={onClick}
            >
                <div className={`w-6 h-6 rounded-md ${color.bg} flex items-center justify-center flex-shrink-0`}>
                    <KpiIcon format={format} className={`w-3 h-3 ${color.text}`} />
                </div>
                <div>
                    <div className="text-sm font-bold text-slate-900">{formatted}</div>
                    {label && <div className="text-[10px] text-slate-400">{label}</div>}
                </div>
            </div>
        )
    }

    const textSize = formatted.length > 12 ? 'text-xl' : 'text-2xl'

    return (
        <div
            key={measureKey}
            className={`flex-1 min-w-[140px] max-w-[220px] bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-colors ${onClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''}`}
            onClick={onClick}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
                    <KpiIcon format={format} className={`w-4 h-4 ${color.text}`} />
                </div>
            </div>
            <div className={`${textSize} font-bold tracking-tight text-slate-900`}>
                {formatted}
            </div>
            {label && (
                <div className="text-xs text-slate-500 mt-1.5 font-medium">
                    {label}
                </div>
            )}
        </div>
    )
}
