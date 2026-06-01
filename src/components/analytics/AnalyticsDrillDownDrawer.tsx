import { useEffect, useRef } from 'react'
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useDrillDownStore, useAnalyticsDrillDownQuery, type DrillDownCard, type DrillSource } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import CardDrillDownRow from './CardDrillDownRow'
import { cn } from '@/lib/utils'

const SOURCE_STYLE: Record<string, { accent: string; chipBg: string; icon: string }> = {
    stage_entries: { accent: 'bg-indigo-500', chipBg: 'bg-indigo-50 text-indigo-700', icon: '📊' },
    current_stage: { accent: 'bg-indigo-500', chipBg: 'bg-indigo-50 text-indigo-700', icon: '📊' },
    closed_deals: { accent: 'bg-emerald-500', chipBg: 'bg-emerald-50 text-emerald-700', icon: '💰' },
    lost_deals: { accent: 'bg-rose-500', chipBg: 'bg-rose-50 text-rose-700', icon: '❌' },
    macro_funnel: { accent: 'bg-blue-500', chipBg: 'bg-blue-50 text-blue-700', icon: '🏊' },
    default: { accent: 'bg-slate-400', chipBg: 'bg-slate-100 text-slate-600', icon: '📋' },
}

function fmtDate(iso: string) {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const SORT_OPTIONS: { label: string; by: string; dir: 'asc' | 'desc' }[] = [
    { label: 'Maior valor', by: 'valor_display', dir: 'desc' },
    { label: 'Mais recentes', by: 'created_at', dir: 'desc' },
    { label: 'Mais tempo parado', by: 'stage_entered_at', dir: 'asc' },
]

export default function AnalyticsDrillDownDrawer() {
    const { isOpen, context, page, sortBy, sortDir, close, setPage, setSort } = useDrillDownStore()
    const { data, isLoading } = useAnalyticsDrillDownQuery()
    const { dateRange } = useAnalyticsFilters()
    const overlayRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, close])

    const handleExportCSV = () => {
        if (!data?.rows.length) return
        const keys: (keyof DrillDownCard)[] = ['titulo', 'pessoa_nome', 'etapa_nome', 'dono_atual_nome', 'valor_display', 'status_comercial', 'created_at', 'data_fechamento', 'data_prevista']
        const labels = ['Título', 'Contato', 'Etapa', 'Responsável', 'Valor', 'Status', 'Criado em', 'Fechamento', 'Data prevista']
        const rows = data.rows.map(row =>
            keys.map(k => {
                const v = row[k]
                if (v === null || v === undefined) return ''
                const s = String(v)
                return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
            }).join(',')
        )
        const csv = [labels.join(','), ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `analytics-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (!isOpen) return null

    const totalCount = data?.totalCount ?? 0
    const totalPages = data?.totalPages ?? 0
    const source = context?.drillSource as DrillSource | undefined
    const style = SOURCE_STYLE[source ?? 'default'] ?? SOURCE_STYLE.default
    const icon = context?.contextIcon ?? (context?.variant === 'forecast' ? '📅' : style.icon)

    // Sub-linha contextual: usa summary explícito; senão monta a partir do contexto do drill.
    const sublineParts: string[] = []
    if (!isLoading) sublineParts.push(`${totalCount} card${totalCount !== 1 ? 's' : ''}`)
    if (context?.summary) {
        sublineParts.push(context.summary)
    } else {
        if (context?.drillPeriodStart && context?.drillPeriodEnd) {
            sublineParts.push(`${fmtDate(context.drillPeriodStart)} – ${fmtDate(context.drillPeriodEnd)}`)
        } else if (!context?.presetRows) {
            sublineParts.push(`${fmtDate(dateRange.start)} – ${fmtDate(dateRange.end)}`)
        }
        if (context?.drillStatusArray?.length) sublineParts.push(`Status: ${context.drillStatusArray.join(', ')}`)
        else if (source === 'lost_deals') sublineParts.push('Perdidos')
        else if (source === 'closed_deals') sublineParts.push('Ganhos')
        if (context?.drillLossReason) sublineParts.push(`Motivo: ${context.drillLossReason}`)
    }

    const currentSort = SORT_OPTIONS.find(o => o.by === sortBy && o.dir === sortDir) ?? SORT_OPTIONS[0]

    return (
        <>
            <div ref={overlayRef} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={close} />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">
                {/* Faixa de cor por tipo de clique */}
                <div className={cn('h-1 w-full shrink-0', style.accent)} />

                {/* Header contextual */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0', style.chipBg)}>
                            <span>{icon}</span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-slate-900 truncate leading-tight" title={context?.label}>
                                {context?.label || 'Detalhe'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {isLoading ? 'Carregando…' : sublineParts.join(' · ')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                        {data && data.rows.length > 0 && (
                            <button onClick={handleExportCSV}
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                                <Download className="w-3.5 h-3.5" /> CSV
                            </button>
                        )}
                        <button onClick={close} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Barra de ordenação */}
                {!isLoading && data && data.rows.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-2 border-b border-slate-100 bg-slate-50/50">
                        <span className="text-[11px] text-slate-400">Ordenar por</span>
                        <select
                            value={currentSort.label}
                            onChange={e => {
                                const opt = SORT_OPTIONS.find(o => o.label === e.target.value)
                                if (opt) setSort(opt.by, opt.dir)
                            }}
                            className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 outline-none focus:ring-1 focus:ring-indigo-300"
                        >
                            {SORT_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </select>
                    </div>
                )}

                {/* Lista */}
                <div className="flex-1 overflow-auto relative">
                    {isLoading ? (
                        <div className="divide-y divide-slate-50">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="px-4 py-3.5">
                                    <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3 mb-2" />
                                    <div className="h-3 bg-slate-50 rounded animate-pulse w-1/2" />
                                </div>
                            ))}
                        </div>
                    ) : !data?.rows.length ? (
                        <div className="px-4 py-16 text-center text-slate-400 text-sm">
                            Nenhum card encontrado para este recorte.
                        </div>
                    ) : (
                        data.rows.map(row => <CardDrillDownRow key={row.id} row={row} source={source} />)
                    )}
                    {isLoading && data && (
                        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        </div>
                    )}
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-white shrink-0">
                        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed">
                            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                        </button>
                        <span className="text-xs text-slate-500">Pág {page + 1} de {totalPages}</span>
                        <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                            className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 disabled:text-slate-300 disabled:cursor-not-allowed">
                            Próximo <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </>
    )
}
