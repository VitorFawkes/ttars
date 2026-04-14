import { useCallback, useMemo, useState } from 'react'
import { RefreshCw, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useReactivationPatterns } from '@/hooks/useReactivationPatterns'
import type { ReactivationPattern, ReactivationFilters } from '@/hooks/useReactivationPatterns'
import ReactivationKPICards from '@/components/reactivation/ReactivationKPICards'
import ReactivationTable from '@/components/reactivation/ReactivationTable'
import ReactivationDetailDrawer from '@/components/reactivation/ReactivationDetailDrawer'
import ReactivationChat from '@/components/reactivation/ReactivationChat'
import ReactivationFiltersPanel from '@/components/reactivation/ReactivationFiltersPanel'
import ReactivationBulkBar from '@/components/reactivation/ReactivationBulkBar'

type Tab = 'ready' | 'all' | 'mine'

export default function ReactivationPage() {
    const { profile } = useAuth()
    const {
        data, loading, totalCount, page, pageSize,
        filters, setFilters, sort, setSort,
        kpis, setPage, recalculate, refresh,
    } = useReactivationPatterns()

    const [selectedPattern, setSelectedPattern] = useState<ReactivationPattern | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [recalculating, setRecalculating] = useState(false)
    const [tab, setTab] = useState<Tab>('ready')

    const currentUserId = profile?.id ?? null

    const patchFilters = useCallback((patch: Partial<ReactivationFilters>) => {
        setFilters(prev => ({ ...prev, ...patch }))
    }, [setFilters])

    const handleTabChange = useCallback((next: Tab) => {
        setTab(next)
        if (next === 'ready') {
            setFilters(prev => ({
                ...prev,
                minScore: Math.max(prev.minScore, 70),
                excludeRecentInteraction: true,
                responsavelId: null,
                unassignedOnly: false,
            }))
        } else if (next === 'mine') {
            setFilters(prev => ({
                ...prev,
                responsavelId: currentUserId ?? null,
                unassignedOnly: false,
            }))
        } else {
            setFilters(prev => ({
                ...prev,
                minScore: 0,
                excludeRecentInteraction: false,
            }))
        }
    }, [setFilters, currentUserId])

    async function handleRecalculate() {
        setRecalculating(true)
        try { await recalculate() } catch { /* logged in hook */ } finally { setRecalculating(false) }
    }

    function toggleSelect(contactId: string) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(contactId)) next.delete(contactId)
            else next.add(contactId)
            return next
        })
    }

    function toggleSelectAllVisible() {
        setSelectedIds(prev => {
            const allSelected = data.every(r => prev.has(r.contact_id))
            const next = new Set(prev)
            if (allSelected) data.forEach(r => next.delete(r.contact_id))
            else data.forEach(r => next.add(r.contact_id))
            return next
        })
    }

    function clearSelection() {
        setSelectedIds(new Set())
    }

    const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])

    return (
        <div className="flex-1 overflow-auto bg-slate-50">
            <div className="max-w-[1400px] mx-auto p-6 space-y-5 pb-32">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                            <Sparkles className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Reativação</h1>
                            <p className="text-xs text-slate-400">Ex-clientes com potencial para nova viagem</p>
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

                <ReactivationKPICards
                    kpis={kpis}
                    loading={loading && data.length === 0}
                    onFilterUrgency={(u) => patchFilters({ urgency: u })}
                    onFilterBirthday={() => patchFilters({ birthdayWindow: 'next30' })}
                />

                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 w-fit">
                    {([
                        { key: 'ready', label: 'Pronto pra prospectar', hint: 'Score alto, sem contato recente' },
                        { key: 'mine', label: 'Minha carteira', hint: 'Atribuídos a mim' },
                        { key: 'all', label: 'Toda base', hint: 'Sem filtro de prontidão' },
                    ] as const).map(t => (
                        <button
                            key={t.key}
                            onClick={() => handleTabChange(t.key)}
                            title={t.hint}
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                tab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar contato..."
                            value={filters.search}
                            onChange={(e) => patchFilters({ search: e.target.value })}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                        {([
                            { key: 'all', label: 'Todos' },
                            { key: 'overdue', label: 'Atrasados' },
                            { key: 'soon', label: 'Agir agora' },
                            { key: 'planned', label: 'Planejados' },
                        ] as const).map(t => (
                            <button
                                key={t.key}
                                onClick={() => patchFilters({ urgency: t.key })}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                                    filters.urgency === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={filters.isHighValue ?? false}
                            onChange={e => patchFilters({ isHighValue: e.target.checked || undefined })}
                        />
                        Alto valor
                    </label>
                </div>

                <ReactivationFiltersPanel
                    filters={filters}
                    onChange={patchFilters}
                    currentUserId={currentUserId}
                />

                <p className="text-xs text-slate-400">
                    Mostrando <span className="font-semibold text-slate-600">{totalCount}</span> contato{totalCount === 1 ? '' : 's'} {tab === 'ready' ? 'prontos pra prospectar' : tab === 'mine' ? 'na sua carteira' : 'na base elegível'}.
                </p>

                <ReactivationTable
                    data={data}
                    loading={loading}
                    totalCount={totalCount}
                    page={page}
                    pageSize={pageSize}
                    sort={sort}
                    selectedIds={selectedIds}
                    onPageChange={setPage}
                    onSortChange={setSort}
                    onSelect={setSelectedPattern}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAllVisible={toggleSelectAllVisible}
                />

                <ReactivationDetailDrawer
                    pattern={selectedPattern}
                    onClose={() => setSelectedPattern(null)}
                />

                <ReactivationChat patterns={data} />
            </div>

            <ReactivationBulkBar
                selectedIds={selectedIdsArray}
                onClear={clearSelection}
                onCompleted={refresh}
            />
        </div>
    )
}
