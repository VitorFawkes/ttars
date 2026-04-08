import { useState } from 'react'
import { RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReactivationPatterns } from '@/hooks/useReactivationPatterns'
import type { ReactivationPattern } from '@/hooks/useReactivationPatterns'
import ReactivationKPICards from '@/components/reactivation/ReactivationKPICards'
import ReactivationTable from '@/components/reactivation/ReactivationTable'
import ReactivationDetailDrawer from '@/components/reactivation/ReactivationDetailDrawer'
import ReactivationChat from '@/components/reactivation/ReactivationChat'

export default function ReactivationPage() {
    const {
        data, loading, totalCount, page, pageSize,
        filters, setFilters, sort, setSort,
        kpis, setPage, recalculate,
    } = useReactivationPatterns()

    const [selectedPattern, setSelectedPattern] = useState<ReactivationPattern | null>(null)
    const [showFilters, setShowFilters] = useState(false)
    const [recalculating, setRecalculating] = useState(false)

    async function handleRecalculate() {
        setRecalculating(true)
        try { await recalculate() } catch { /* logged in hook */ } finally { setRecalculating(false) }
    }

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <div className="max-w-[1400px] mx-auto p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                            <Sparkles className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Reativação</h1>
                            <p className="text-xs text-slate-400">Clientes com potencial para nova viagem</p>
                        </div>
                    </div>
                    <button
                        onClick={handleRecalculate}
                        disabled={recalculating}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600',
                            recalculating && 'opacity-50 pointer-events-none'
                        )}
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', recalculating && 'animate-spin')} />
                        {recalculating ? 'Calculando...' : 'Recalcular'}
                    </button>
                </div>

                {/* KPIs */}
                <ReactivationKPICards
                    kpis={kpis}
                    loading={loading && data.length === 0}
                    onFilterUrgency={(u) => setFilters(prev => ({ ...prev, urgency: u }))}
                />

                {/* Barra de filtros */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar contato..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                        {([
                            { key: 'all', label: 'Todos' },
                            { key: 'overdue', label: 'Atrasados' },
                            { key: 'soon', label: 'Agir agora' },
                            { key: 'planned', label: 'Planejados' },
                        ] as const).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilters(prev => ({ ...prev, urgency: tab.key }))}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                    filters.urgency === tab.key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                            showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'
                        )}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Filtros
                    </button>
                </div>

                {showFilters && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-6">
                        <div>
                            <label className="text-[11px] font-medium text-slate-400 mb-1 block">Score mínimo</label>
                            <input
                                type="number" min={0} max={100}
                                value={filters.minScore}
                                onChange={(e) => setFilters(prev => ({ ...prev, minScore: Number(e.target.value) }))}
                                className="w-20 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg"
                            />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.isHighValue ?? false}
                                onChange={(e) => setFilters(prev => ({ ...prev, isHighValue: e.target.checked || undefined }))}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-600">Apenas alto valor</span>
                        </label>
                    </div>
                )}

                {/* Tabela */}
                <ReactivationTable
                    data={data}
                    loading={loading}
                    totalCount={totalCount}
                    page={page}
                    pageSize={pageSize}
                    sort={sort}
                    onPageChange={setPage}
                    onSortChange={setSort}
                    onSelect={setSelectedPattern}
                />

                <ReactivationDetailDrawer
                    pattern={selectedPattern}
                    onClose={() => setSelectedPattern(null)}
                />

                <ReactivationChat patterns={data} />
            </div>
        </div>
    )
}
