import { getColorScheme } from '@/lib/reports/chartDefaults'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

export default function FunnelRenderer({
    data,
    visualization,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
    keyFormats,
    onDrillDown,
}: ChartRendererProps) {
    const colors = getColorScheme(visualization.colorScheme)
    const dimKey = dimensionKeys[0]
    const measureKey = measureKeys[0]
    const fmt = keyFormats?.[measureKey] ?? labelFormat

    if (!data.length || !measureKey) {
        return (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                Nenhum registro encontrado
            </div>
        )
    }

    const maxValue = Math.max(...data.map(d => Number(d[measureKey] ?? 0)), 1)
    const firstValue = Number(data[0]?.[measureKey] ?? 1) || 1

    return (
        <div className="space-y-1 py-3 px-1">
            {data.map((row, i) => {
                const value = Number(row[measureKey] ?? 0)
                const label = String(row[dimKey] ?? `Item ${i + 1}`)
                const widthPct = Math.max((value / maxValue) * 100, 6)
                const pctOfFirst = Math.round((value / firstValue) * 100)

                return (
                    <button
                        key={i}
                        onClick={() => {
                            if (onDrillDown && dimKey && row[dimKey] != null) {
                                onDrillDown({ [dimKey]: row[dimKey] })
                            }
                        }}
                        className="w-full group"
                    >
                        <div className="flex items-center gap-3 py-0.5">
                            <div className="w-28 md:w-40 text-right text-xs text-slate-600 truncate flex-shrink-0 font-medium" title={label}>
                                {label}
                            </div>
                            <div className="flex-1 relative">
                                <div
                                    className="h-9 rounded-md transition-all duration-200 group-hover:brightness-110 flex items-center px-3"
                                    style={{
                                        width: `${widthPct}%`,
                                        backgroundColor: colors[i % colors.length],
                                        minWidth: '60px',
                                    }}
                                >
                                    <span className="text-xs font-semibold text-white truncate">
                                        {autoFormat(value, fmt)}
                                    </span>
                                </div>
                            </div>
                            <div className="w-14 text-xs text-slate-400 text-right flex-shrink-0 font-mono">
                                {pctOfFirst}%
                            </div>
                        </div>
                    </button>
                )
            })}
            {labels?.[measureKey] && (
                <div className="text-[10px] text-slate-400 text-right pt-2 pr-14">
                    {labels[measureKey]} — % relativo ao topo
                </div>
            )}
        </div>
    )
}
