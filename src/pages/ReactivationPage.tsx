import { useState } from 'react'
import { RefreshCw, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReactivationPatterns } from '@/hooks/useReactivationPatterns'
import type { ReactivationPattern } from '@/hooks/useReactivationPatterns'
import ReactivationKPICards from '@/components/reactivation/ReactivationKPICards'
import ReactivationTable from '@/components/reactivation/ReactivationTable'
import ReactivationDetailDrawer from '@/components/reactivation/ReactivationDetailDrawer'

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
        try {
            await recalculate()
        } catch {
            // Error already logged in hook
        } finally {
            setRecalculating(false)
        }
    }

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <div className="max-w-[1400px] mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                                Reativacao Inteligente
                            </h1>
                            <p className="text-sm text-slate-500">
                                Clientes com alta probabilidade de estarem planejando nova viagem
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleRecalculate}
                        disabled={recalculating}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                            'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600',
                            recalculating && 'opacity-60 cursor-not-allowed'
                        )}
                    >
                        <RefreshCw className={cn('w-4 h-4', recalculating && 'animate-spin')} />
                        {recalculating ? 'Calculando...' : 'Recalcular'}
                    </button>
                </div>

                {/* KPIs */}
                <ReactivationKPICards
                    kpis={kpis}
                    loading={loading && data.length === 0}
                    onFilterUrgency={(urgency) => setFilters(prev => ({ ...prev, urgency }))}
                />

                {/* Filters Bar */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar contato..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    {/* Urgency Tabs */}
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                        {([
                            { key: 'all', label: 'Todos' },
                            { key: 'overdue', label: 'Atrasados' },
                            { key: 'soon', label: 'Proximos' },
                            { key: 'planned', label: 'Planejados' },
                        ] as const).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilters(prev => ({ ...prev, urgency: tab.key }))}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                    filters.urgency === tab.key
                                        ? 'bg-indigo-50 text-indigo-700'
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
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all',
                            showFilters
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        Filtros
                    </button>
                </div>

                {/* Extra Filters */}
                {showFilters && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 block">Score minimo</label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={filters.minScore}
                                onChange={(e) => setFilters(prev => ({ ...prev, minScore: Number(e.target.value) }))}
                                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-500">Alto valor</label>
                            <input
                                type="checkbox"
                                checked={filters.isHighValue ?? false}
                                onChange={(e) => setFilters(prev => ({ ...prev, isHighValue: e.target.checked || undefined }))}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                )}

                {/* Table */}
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

                {/* Detail Drawer */}
                <ReactivationDetailDrawer
                    pattern={selectedPattern}
                    onClose={() => setSelectedPattern(null)}
                />
            </div>
        </div>
    )
}
