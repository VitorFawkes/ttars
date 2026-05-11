import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, Filter } from 'lucide-react'
import { useDrillDownStore, useAnalyticsDrillDownQuery, type DrillDownCard, type DrillSource } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    ganho: { label: 'Ganho', cls: 'bg-green-100 text-green-700' },
    perdido: { label: 'Perdido', cls: 'bg-red-100 text-red-700' },
    aberto: { label: 'Aberto', cls: 'bg-blue-100 text-blue-700' },
}

type SortableColumn = 'titulo' | 'etapa_nome' | 'valor_display' | 'receita' | 'created_at' | 'data_fechamento' | 'stage_entered_at'

type ColumnDef = { key: SortableColumn | string; label: string; sortable: boolean; align?: 'right' }

const BASE_COLUMNS: ColumnDef[] = [
    { key: 'titulo', label: 'Título', sortable: true },
    { key: 'pessoa_nome', label: 'Contato', sortable: false },
    { key: 'etapa_nome', label: 'Etapa', sortable: true },
    { key: 'dono_atual_nome', label: 'Responsável', sortable: false },
    { key: 'valor_display', label: 'Valor', sortable: true, align: 'right' },
    { key: 'status_comercial', label: 'Status', sortable: false },
    { key: 'created_at', label: 'Criado', sortable: true },
]

function getColumns(source?: string): ColumnDef[] {
    const cols = [...BASE_COLUMNS]
    if (source === 'current_stage' || source === 'stage_entries') {
        // Insert "Na Etapa Desde" after "Etapa"
        const idx = cols.findIndex(c => c.key === 'etapa_nome')
        cols.splice(idx + 1, 0, { key: 'stage_entered_at', label: 'Na Etapa Desde', sortable: true })
    }
    if (source === 'closed_deals') {
        // Add "Fechamento" before "Criado"
        const idx = cols.findIndex(c => c.key === 'created_at')
        cols.splice(idx, 0, { key: 'data_fechamento', label: 'Fechamento', sortable: true })
    }
    return cols
}

function getFilterDescription(source: DrillSource | undefined, dateStart: string, dateEnd: string): string | null {
    const fmtDate = (iso: string) => {
        const d = new Date(iso)
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    const range = `${fmtDate(dateStart)} — ${fmtDate(dateEnd)}`
    switch (source) {
        case 'stage_entries':
        case 'macro_funnel':
            return `Cards que entraram na etapa entre ${range}`
        case 'closed_deals':
            return `Cards ganhos com fechamento entre ${range}`
        case 'current_stage':
            return `Cards ativos criados entre ${range}`
        case 'lost_deals':
            return `Cards perdidos entre ${range}`
        default:
            return `Período: ${range}`
    }
}

function formatDate(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('pt-BR')
}

function CellValue({ col, row }: { col: ColumnDef; row: DrillDownCard }) {
    const val = row[col.key as keyof DrillDownCard]

    if (col.key === 'titulo') {
        return (
            <Link
                to={`/cards/${row.id}`}
                className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium truncate max-w-[200px] block"
                title={row.titulo}
            >
                {row.titulo || '(sem título)'}
            </Link>
        )
    }

    if (col.key === 'pessoa_nome') {
        return <span className="truncate max-w-[120px] block">{val || '—'}</span>
    }

    if (col.key === 'etapa_nome') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                {val || '—'}
            </span>
        )
    }

    if (col.key === 'valor_display') {
        return <span className="font-mono">{formatCurrency(Number(val) || 0)}</span>
    }

    if (col.key === 'status_comercial') {
        const s = STATUS_BADGE[String(val)] || { label: String(val || '—'), cls: 'bg-slate-100 text-slate-600' }
        return (
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', s.cls)}>
                {s.label}
            </span>
        )
    }

    if (col.key === 'created_at' || col.key === 'data_fechamento' || col.key === 'stage_entered_at') {
        return <span>{formatDate(val as string)}</span>
    }

    return <span>{val != null ? String(val) : '—'}</span>
}

export default function AnalyticsDrillDownDrawer() {
    const { isOpen, context, page, sortBy, sortDir, close, setPage, toggleSort } = useDrillDownStore()
    const { data, isLoading } = useAnalyticsDrillDownQuery()
    const { dateRange } = useAnalyticsFilters()
    const overlayRef = useRef<HTMLDivElement>(null)
    const columns = useMemo(() => getColumns(context?.drillSource), [context?.drillSource])
    const filterDesc = useMemo(
        () => getFilterDescription(context?.drillSource as DrillSource, dateRange.start, dateRange.end),
        [context?.drillSource, dateRange.start, dateRange.end],
    )

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, close])

    const handleExportCSV = () => {
        if (!data?.rows.length) return
        const keys: (keyof DrillDownCard)[] = ['titulo', 'pessoa_nome', 'etapa_nome', 'dono_atual_nome', 'valor_display', 'receita', 'status_comercial', 'created_at', 'data_fechamento']
        const labels = ['Título', 'Contato', 'Etapa', 'Responsável', 'Valor', 'Receita', 'Status', 'Criado em', 'Fechamento']
        const header = labels.join(',')
        const rows = data.rows.map(row =>
            keys.map(k => {
                const v = row[k]
                if (v === null || v === undefined) return ''
                const s = String(v)
                return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
            }).join(',')
        )
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `analytics-drill-down-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!isOpen) return null

    const totalCount = data?.totalCount ?? 0
    const totalPages = data?.totalPages ?? 0

    return (
        <>
            {/* Overlay */}
            <div
                ref={overlayRef}
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
                onClick={close}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ease-out">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-slate-800 truncate">
                            {context?.label}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-400">
                                {totalCount > 0 ? `${totalCount} card${totalCount !== 1 ? 's' : ''} encontrado${totalCount !== 1 ? 's' : ''}` : 'Carregando...'}
                            </p>
                            {filterDesc && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    <p className="text-xs text-slate-400 flex items-center gap-1">
                                        <Filter className="w-3 h-3" />
                                        {filterDesc}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        {data && data.rows.length > 0 && (
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
                            >
                                <Download className="w-3.5 h-3.5" />
                                CSV
                            </button>
                        )}
                        <button
                            onClick={close}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-200 bg-slate-50">
                                {columns.map(col => (
                                    <th
                                        key={col.key}
                                        className={cn(
                                            'px-4 py-3 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap',
                                            col.align === 'right' ? 'text-right' : 'text-left',
                                            col.sortable ? 'cursor-pointer select-none hover:text-slate-800 text-slate-500' : 'text-slate-400',
                                        )}
                                        onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                                    >
                                        <span className="inline-flex items-center gap-0.5">
                                            {col.label}
                                            {col.sortable && sortBy === col.key && (
                                                sortDir === 'desc'
                                                    ? <ChevronDown className="w-3 h-3 text-indigo-600" />
                                                    : <ChevronUp className="w-3 h-3 text-indigo-600" />
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={columns.length} className="px-4 py-3">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : !data?.rows.length ? (
                                <tr>
                                    <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400 text-sm">
                                        Nenhum card encontrado para este filtro
                                    </td>
                                </tr>
                            ) : (
                                data.rows.map(row => (
                                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        {columns.map(col => (
                                            <td
                                                key={col.key}
                                                className={cn(
                                                    'px-4 py-2.5 text-slate-600',
                                                    col.align === 'right' && 'text-right',
                                                )}
                                            >
                                                <CellValue col={col} row={row} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-white">
                        <button
                            onClick={() => setPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Anterior
                        </button>
                        <span className="text-xs text-slate-500">
                            Pág {page + 1} de {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                        >
                            Próximo
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Loading overlay for page changes */}
                {isLoading && data && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-20">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    </div>
                )}
            </div>
        </>
    )
}
