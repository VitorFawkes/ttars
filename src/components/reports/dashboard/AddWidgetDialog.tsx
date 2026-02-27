import { useState, useMemo, useEffect } from 'react'
import { Search, Plus, Loader2 } from 'lucide-react'
import { useSavedReports } from '@/hooks/reports/useSavedReports'
import { SOURCE_MAP } from '@/lib/reports/sourceMap'
import { VIZ_LABELS } from '@/lib/reports/chartDefaults'
import { cn } from '@/lib/utils'
import type { VizType } from '@/lib/reports/reportTypes'

interface AddWidgetDialogProps {
    open: boolean
    onClose: () => void
    onAdd: (reportId: string) => void
    existingReportIds: string[]
}

export default function AddWidgetDialog({
    open,
    onClose,
    onAdd,
    existingReportIds,
}: AddWidgetDialogProps) {
    const [search, setSearch] = useState('')
    const { data: reports, isLoading } = useSavedReports()

    const filtered = useMemo(() => {
        if (!reports) return []
        const list = reports.filter(r => !existingReportIds.includes(r.id))
        if (!search) return list
        const q = search.toLowerCase()
        return list.filter(r => r.title.toLowerCase().includes(q))
    }, [reports, search, existingReportIds])

    useEffect(() => {
        if (!open) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 max-h-[70vh] flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Adicionar Widget</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Selecione um relatório para adicionar ao dashboard</p>
                </div>

                <div className="px-6 py-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar relatórios..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center py-8 text-sm text-slate-400">
                            {reports?.length === 0 ? 'Nenhum relatório criado ainda' : 'Nenhum relatório encontrado'}
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(report => {
                                const sourceMeta = SOURCE_MAP[report.config.source]
                                const Icon = sourceMeta?.icon
                                return (
                                    <button
                                        key={report.id}
                                        onClick={() => {
                                            onAdd(report.id)
                                            onClose()
                                        }}
                                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-indigo-50 transition-colors group"
                                    >
                                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', sourceMeta?.bgColor ?? 'bg-slate-100')}>
                                            {Icon && <Icon className={cn('w-4 h-4', sourceMeta?.color ?? 'text-slate-500')} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-700 group-hover:text-indigo-700 truncate">{report.title}</div>
                                            <div className="text-[10px] text-slate-400">
                                                {sourceMeta?.label} · {VIZ_LABELS[report.visualization.type as VizType] ?? report.visualization.type}
                                            </div>
                                        </div>
                                        <Plus className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 flex-shrink-0" />
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="px-6 py-3 border-t border-slate-200">
                    <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}
