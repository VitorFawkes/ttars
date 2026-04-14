import { useState } from 'react'
import { Search, X, ListFilter } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { TASK_TYPE_CONFIG, PRIORIDADE_CONFIG, ORIGEM_CONFIG } from './taskTypeConfig'
import type {
    TaskFilterState,
    TaskDeadlineFilter,
    TaskStatusFilter,
    TaskScopeFilter,
    TaskPrioridadeFilter,
    TaskOrigemFilter,
} from '../../hooks/useTaskFilters'

const DEADLINE_OPTIONS: { value: TaskDeadlineFilter; label: string; variant: string }[] = [
    { value: 'all', label: 'Todas', variant: 'default' },
    { value: 'overdue', label: 'Atrasadas', variant: 'overdue' },
    { value: 'today', label: 'Hoje', variant: 'today' },
    { value: 'tomorrow', label: 'Amanhã', variant: 'future' },
    { value: 'this_week', label: 'Esta Semana', variant: 'future' },
    { value: 'next_week', label: 'Próx. Semana', variant: 'future' },
    { value: 'no_date', label: 'Sem Prazo', variant: 'default' },
]

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pendentes' },
    { value: 'completed_today', label: 'Concluídas hoje' },
    { value: 'all', label: 'Todas' },
]

const SCOPE_OPTIONS: { value: TaskScopeFilter; label: string }[] = [
    { value: 'minhas', label: 'Minhas' },
    { value: 'meu_time', label: 'Meu time' },
    { value: 'todas', label: 'Todas' },
]

const PRIORIDADE_OPTIONS: TaskPrioridadeFilter[] = ['alta', 'media', 'baixa']
const ORIGEM_OPTIONS: TaskOrigemFilter[] = ['manual', 'cadencia', 'automacao', 'integracao']

const FASE_PRESETS: { slug: string; label: string }[] = [
    { slug: 'sdr', label: 'SDR' },
    { slug: 'planner', label: 'Planner' },
    { slug: 'pos-venda', label: 'Pós-venda' },
    { slug: 'concierge', label: 'Concierge' },
]

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    onReset: () => void
    taskCount: number
    isLoading: boolean
}

export function TaskFiltersBar({ filters, setFilters, onReset, taskCount, isLoading }: Props) {
    const { data: options } = useFilterOptions()
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [personSearch, setPersonSearch] = useState('')

    const profiles = options?.profiles || []

    const activeFilterCount =
        filters.tipos.length +
        filters.responsavelIds.length +
        (filters.dateFrom || filters.dateTo ? 1 : 0) +
        (filters.deadlineFilter !== 'all' ? 1 : 0) +
        (filters.search ? 1 : 0) +
        filters.prioridades.length +
        filters.origens.length +
        filters.fases.length

    const hasCustomFilters = activeFilterCount > 0 || filters.statusFilter !== 'pending' || filters.scope !== 'minhas'

    const filteredProfiles = personSearch
        ? profiles.filter(p =>
            (p.full_name || '').toLowerCase().includes(personSearch.toLowerCase()) ||
            (p.email || '').toLowerCase().includes(personSearch.toLowerCase())
        )
        : profiles

    return (
        <>
            {/* Top row: Scope + Status + Search + Filter toggle */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Scope */}
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {SCOPE_OPTIONS.map((opt) => (
                        <SegmentButton
                            key={opt.value}
                            active={filters.scope === opt.value}
                            onClick={() => setFilters({ scope: opt.value })}
                            label={opt.label}
                        />
                    ))}
                </div>

                {/* Status */}
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                    {STATUS_OPTIONS.map((opt) => (
                        <SegmentButton
                            key={opt.value}
                            active={filters.statusFilter === opt.value}
                            onClick={() => setFilters({ statusFilter: opt.value })}
                            label={opt.label}
                        />
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por título ou descrição..."
                        value={filters.search}
                        onChange={(e) => setFilters({ search: e.target.value })}
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                    />
                    {filters.search && (
                        <button
                            onClick={() => setFilters({ search: '' })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Advanced filter toggle */}
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all",
                        showAdvanced
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    )}
                >
                    <ListFilter className="h-4 w-4" />
                    Filtros
                    {activeFilterCount > 0 && (
                        <span className="text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                {hasCustomFilters && (
                    <button onClick={onReset} className="text-xs text-slate-500 hover:text-slate-700 underline">
                        Limpar
                    </button>
                )}

                <div className="ml-auto text-xs text-slate-500">
                    {isLoading ? 'Carregando...' : `${taskCount} ${taskCount === 1 ? 'tarefa' : 'tarefas'}`}
                </div>
            </div>

            {/* Deadline pills */}
            <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
                {DEADLINE_OPTIONS.map((opt) => (
                    <DeadlinePill
                        key={opt.value}
                        label={opt.label}
                        active={filters.deadlineFilter === opt.value}
                        variant={opt.variant}
                        onClick={() => setFilters({ deadlineFilter: opt.value, dateFrom: undefined, dateTo: undefined })}
                    />
                ))}
            </div>

            {/* Advanced panel */}
            {showAdvanced && (
                <div className="mt-4 border-t border-slate-200 pt-4 bg-slate-50/50 -mx-6 px-6 pb-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Tipo */}
                        <FilterGroup label="Tipo">
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(TASK_TYPE_CONFIG).filter(([k]) => !['ligacao', 'whatsapp', 'outro'].includes(k)).map(([key, cfg]) => {
                                    const Icon = cfg.icon
                                    const active = filters.tipos.includes(key)
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                const tipos = active ? filters.tipos.filter(t => t !== key) : [...filters.tipos, key]
                                                setFilters({ tipos })
                                            }}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                active ? `${cfg.bg} ${cfg.color} border-current/20` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            <Icon className="h-3 w-3" />
                                            {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </FilterGroup>

                        {/* Prioridade */}
                        <FilterGroup label="Prioridade">
                            <div className="flex gap-1.5">
                                {PRIORIDADE_OPTIONS.map((p) => {
                                    const cfg = PRIORIDADE_CONFIG[p]
                                    const active = filters.prioridades.includes(p)
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => {
                                                const prioridades = active ? filters.prioridades.filter(x => x !== p) : [...filters.prioridades, p]
                                                setFilters({ prioridades })
                                            }}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all",
                                                active ? `${cfg.chip} ${cfg.chipText}` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            <span className={cn("h-2 w-2 rounded-full", cfg.bar)} />
                                            {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </FilterGroup>

                        {/* Origem */}
                        <FilterGroup label="Origem">
                            <div className="flex flex-wrap gap-1.5">
                                {ORIGEM_OPTIONS.map((o) => {
                                    const cfg = ORIGEM_CONFIG[o]
                                    const active = filters.origens.includes(o)
                                    return (
                                        <button
                                            key={o}
                                            onClick={() => {
                                                const origens = active ? filters.origens.filter(x => x !== o) : [...filters.origens, o]
                                                setFilters({ origens })
                                            }}
                                            className={cn(
                                                "px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                active ? cfg.chip : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            {cfg.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </FilterGroup>

                        {/* Fase do time */}
                        <FilterGroup label="Fase do responsável">
                            <div className="flex flex-wrap gap-1.5">
                                {FASE_PRESETS.map((f) => {
                                    const active = filters.fases.includes(f.slug)
                                    return (
                                        <button
                                            key={f.slug}
                                            onClick={() => {
                                                const fases = active ? filters.fases.filter(x => x !== f.slug) : [...filters.fases, f.slug]
                                                setFilters({ fases })
                                            }}
                                            className={cn(
                                                "px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                active ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </FilterGroup>

                        {/* Responsável */}
                        <FilterGroup label="Responsável (filtro explícito)">
                            <div className="relative mb-2">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar pessoa..."
                                    value={personSearch}
                                    onChange={(e) => setPersonSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
                                {filteredProfiles.map((p) => {
                                    const active = filters.responsavelIds.includes(p.id)
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                const ids = active ? filters.responsavelIds.filter(id => id !== p.id) : [...filters.responsavelIds, p.id]
                                                setFilters({ responsavelIds: ids })
                                            }}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-all",
                                                active ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                            )}
                                        >
                                            <div className={cn(
                                                "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0",
                                                active ? "bg-indigo-200 text-indigo-800" : "bg-slate-200 text-slate-600"
                                            )}>
                                                {(p.full_name || '?').charAt(0).toUpperCase()}
                                            </div>
                                            {(p.full_name || p.email || '').split(' ')[0]}
                                        </button>
                                    )
                                })}
                            </div>
                        </FilterGroup>

                        {/* Date range */}
                        <FilterGroup label="Período (vencimento)">
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={filters.dateFrom || ''}
                                    onChange={(e) => setFilters({ dateFrom: e.target.value || undefined, deadlineFilter: 'all' })}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <span className="text-xs text-slate-400">até</span>
                                <input
                                    type="date"
                                    value={filters.dateTo || ''}
                                    onChange={(e) => setFilters({ dateTo: e.target.value || undefined, deadlineFilter: 'all' })}
                                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                        </FilterGroup>
                    </div>
                </div>
            )}
        </>
    )
}

function SegmentButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
        >
            {label}
        </button>
    )
}

function DeadlinePill({ label, active, variant, onClick }: { label: string; active: boolean; variant: string; onClick: () => void }) {
    const styles: Record<string, { base: string; active: string }> = {
        default: { base: 'border-slate-200 text-slate-600', active: 'bg-slate-100 border-slate-300 shadow-sm' },
        overdue: { base: 'border-red-200 text-red-700', active: 'bg-red-50 border-red-300 shadow-sm' },
        today: { base: 'border-blue-200 text-blue-700', active: 'bg-blue-50 border-blue-300 shadow-sm' },
        future: { base: 'border-emerald-200 text-emerald-700', active: 'bg-emerald-50 border-emerald-300 shadow-sm' },
    }
    const s = styles[variant] || styles.default
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap",
                s.base,
                active ? s.active : "bg-white hover:shadow-sm"
            )}
        >
            {label}
        </button>
    )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{label}</label>
            {children}
        </div>
    )
}
