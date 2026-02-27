import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Pin, Clock, Eye, Loader2, Sparkles, LayoutDashboard, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSavedReports } from '@/hooks/reports/useSavedReports'
import { useSavedDashboards } from '@/hooks/reports/useSavedDashboards'
import { VIZ_LABELS } from '@/lib/reports/chartDefaults'
import { SOURCE_MAP } from '@/lib/reports/sourceMap'
import type { SavedReport, VizType } from '@/lib/reports/reportTypes'

export default function ReportsList() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const showTemplates = searchParams.get('tab') === 'templates'
    const [search, setSearch] = useState('')
    const { data: reports, isLoading } = useSavedReports()
    const { data: dashboards } = useSavedDashboards()

    const pinnedDashboards = useMemo(() => {
        if (!dashboards || showTemplates) return []
        return dashboards.filter(d => d.pinned)
    }, [dashboards, showTemplates])

    const filtered = useMemo(() => {
        if (!reports) return []
        const list = showTemplates
            ? reports.filter(r => r.is_template)
            : reports.filter(r => !r.is_template)

        if (!search) return list
        const q = search.toLowerCase()
        return list.filter(r =>
            r.title.toLowerCase().includes(q) ||
            r.description?.toLowerCase().includes(q) ||
            r.config.source.toLowerCase().includes(q)
        )
    }, [reports, search, showTemplates])

    return (
        <div className="flex-1 overflow-y-auto p-6">
            {/* Pinned Dashboards — quick access for executives */}
            {pinnedDashboards.length > 0 && !search && (
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <LayoutDashboard className="w-4 h-4 text-indigo-500" />
                            Dashboards Fixados
                        </h2>
                        <button
                            onClick={() => navigate('/reports/dashboards')}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                        >
                            Ver todos <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {pinnedDashboards.map(dash => (
                            <button
                                key={dash.id}
                                onClick={() => navigate(`/reports/dashboards/${dash.id}`)}
                                className="text-left bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 transition-all group"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                        <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <Pin className="w-3 h-3 text-amber-500" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 truncate">
                                    {dash.title}
                                </h3>
                                {dash.description && (
                                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{dash.description}</p>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                        {showTemplates ? 'Templates de Relatórios' : 'Meus Relatórios'}
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        {showTemplates ? 'Relatórios pré-prontos para começar rápido' : 'Seus relatórios customizados'}
                    </p>
                </div>
                {!showTemplates && (
                    <button
                        onClick={() => navigate('/reports/new')}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Relatório
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar relatórios..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState showTemplates={showTemplates} onNew={() => navigate('/reports/new')} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(report => (
                        <ReportCard
                            key={report.id}
                            report={report}
                            onClick={() => {
                                if (showTemplates) {
                                    // Clone template
                                    navigate(`/reports/new?template=${report.id}`)
                                } else {
                                    navigate(`/reports/${report.id}`)
                                }
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function ReportCard({ report, onClick }: { report: SavedReport; onClick: () => void }) {
    const sourceMeta = SOURCE_MAP[report.config.source]
    const SourceIcon = sourceMeta?.icon

    return (
        <button
            onClick={onClick}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all duration-200 group"
        >
            <div className="flex items-start justify-between mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', sourceMeta?.bgColor ?? 'bg-slate-100')}>
                    {SourceIcon && <SourceIcon className={cn('w-4 h-4', sourceMeta?.color ?? 'text-slate-500')} />}
                </div>
                <div className="flex items-center gap-1.5">
                    {report.pinned && <Pin className="w-3 h-3 text-amber-500" />}
                    {report.is_template && <Sparkles className="w-3 h-3 text-indigo-400" />}
                </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                {report.title}
            </h3>
            {report.description && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{report.description}</p>
            )}

            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {VIZ_LABELS[report.visualization.type as VizType] ?? report.visualization.type}
                </span>
                <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(report.updated_at).toLocaleDateString('pt-BR')}
                </span>
            </div>
        </button>
    )
}

function EmptyState({ showTemplates, onNew }: { showTemplates: boolean; onNew: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                {showTemplates ? <Sparkles className="w-7 h-7 text-slate-300" /> : <Plus className="w-7 h-7 text-slate-300" />}
            </div>
            <p className="text-sm font-medium text-slate-500">
                {showTemplates ? 'Nenhum template encontrado' : 'Nenhum relatório criado'}
            </p>
            <p className="text-xs mt-1 mb-4">
                {showTemplates ? 'Templates serão adicionados em breve' : 'Crie seu primeiro relatório customizado'}
            </p>
            {!showTemplates && (
                <button
                    onClick={onNew}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Novo Relatório
                </button>
            )}
        </div>
    )
}
