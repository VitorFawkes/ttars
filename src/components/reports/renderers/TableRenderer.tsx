import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { autoFormat } from '@/lib/reports/formatters'
import type { ChartRendererProps } from './ChartRenderer'

export default function TableRenderer({
    data,
    dimensionKeys,
    measureKeys,
    labels,
    labelFormat,
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

    if (!data.length) {
        return (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                Sem dados para exibir
            </div>
        )
    }

    return (
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
                                            ? autoFormat(row[k], labelFormat)
                                            : String(row[k])
                                    }
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
