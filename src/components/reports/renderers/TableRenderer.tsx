import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { autoFormat, formatDateAxis } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

export default function TableRenderer({
    data,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
    keyFormats,
    dateGrouping,
    onDrillDown,
}: ChartRendererProps) {
    const [sortKey, setSortKey] = useState<string | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const allKeys = [...dimensionKeys, ...measureKeys]

    const sorted = useMemo(() => {
        if (!sortKey) return data
        return [...data].sort((a, b) => {
            const av = a[sortKey]
            const bv = b[sortKey]
            if (av == null && bv == null) return 0
            if (av == null) return 1
            if (bv == null) return -1
            if (typeof av === 'number' && typeof bv === 'number') {
                return sortDir === 'asc' ? av - bv : bv - av
            }
            const sa = String(av)
            const sb = String(bv)
            return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
        })
    }, [data, sortKey, sortDir])

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    const isMeasure = (key: string) => measureKeys.includes(key)

    // Compute totals for measure columns
    const totals = useMemo(() => {
        const t: Record<string, number> = {}
        for (const mk of measureKeys) {
            t[mk] = data.reduce((sum, row) => sum + Number(row[mk] ?? 0), 0)
        }
        return t
    }, [data, measureKeys])

    if (!data.length) {
        return (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                Nenhum registro encontrado
            </div>
        )
    }

    return (
        <div className="relative">
            <div className="overflow-auto max-h-[500px] rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200">
                            {allKeys.map(k => (
                                <th
                                    key={k}
                                    className="text-left py-3 px-4 text-slate-500 font-medium bg-slate-50/80 sticky top-0 cursor-pointer hover:bg-slate-100 select-none text-xs uppercase tracking-wide"
                                    onClick={() => handleSort(k)}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span>{labels?.[k] ?? k}</span>
                                        {sortKey === k ? (
                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                        ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300" />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((row, i) => (
                            <tr
                                key={i}
                                className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
                                onClick={() => {
                                    if (onDrillDown && dimensionKeys.length > 0) {
                                        const filters: Record<string, unknown> = {}
                                        for (const dk of dimensionKeys) {
                                            if (row[dk] != null) filters[dk] = row[dk]
                                        }
                                        if (Object.keys(filters).length > 0) onDrillDown(filters)
                                    }
                                }}
                            >
                                {allKeys.map(k => (
                                    <td
                                        key={k}
                                        className={`py-2.5 px-4 ${isMeasure(k) ? 'text-right font-mono text-slate-700 font-medium' : 'text-slate-600'}`}
                                    >
                                        {row[k] === null || row[k] === undefined
                                            ? <span className="text-slate-300">—</span>
                                            : isMeasure(k)
                                                ? autoFormat(row[k], keyFormats?.[k] ?? labelFormat)
                                                : typeof row[k] === 'string' && /^\d{4}-\d{2}/.test(row[k] as string) && !isNaN(Date.parse(row[k] as string))
                                                    ? formatDateAxis(row[k] as string, dateGrouping)
                                                    : String(row[k])
                                        }
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {/* Total row */}
                    {measureKeys.length > 0 && data.length > 1 && (
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                                {allKeys.map((k, i) => (
                                    <td
                                        key={k}
                                        className={`py-2.5 px-4 text-xs font-semibold ${isMeasure(k) ? 'text-right font-mono text-slate-800' : 'text-slate-500'}`}
                                    >
                                        {isMeasure(k)
                                            ? autoFormat(totals[k], keyFormats?.[k] ?? labelFormat)
                                            : i === 0 ? 'Total' : ''
                                        }
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            {/* Scroll fade indicator */}
            {data.length > 12 && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none rounded-b-lg" />
            )}
        </div>
    )
}
