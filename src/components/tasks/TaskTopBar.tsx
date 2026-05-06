import { Search, X, ListFilter, List, Layers, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { TaskFilterState, TaskScopeFilter } from '../../hooks/useTaskFilters'

export type TaskViewMode = 'list' | 'by_card' | 'duplicates'

const SCOPE_OPTIONS: { value: TaskScopeFilter; label: string }[] = [
    { value: 'minhas', label: 'Minhas' },
    { value: 'meu_time', label: 'Meu time' },
    { value: 'todas', label: 'Todas' },
]

const VIEW_OPTIONS: { value: TaskViewMode; label: string; icon: typeof List }[] = [
    { value: 'list', label: 'Lista', icon: List },
    { value: 'by_card', label: 'Por viagem', icon: Layers },
    { value: 'duplicates', label: 'Duplicadas', icon: Copy },
]

interface Props {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    viewMode: TaskViewMode
    onViewModeChange: (mode: TaskViewMode) => void
    moreFiltersCount: number
    moreFiltersOpen: boolean
    onToggleMoreFilters: () => void
    taskCount: number
    isLoading: boolean
}

export function TaskTopBar({
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    moreFiltersCount,
    moreFiltersOpen,
    onToggleMoreFilters,
    taskCount,
    isLoading,
}: Props) {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            {/* Busca */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
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
                        aria-label="Limpar busca"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Escopo */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
                {SCOPE_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => setFilters({ scope: opt.value })}
                        className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                            filters.scope === opt.value
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700',
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* View mode */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
                {VIEW_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const active = viewMode === opt.value
                    return (
                        <button
                            key={opt.value}
                            onClick={() => onViewModeChange(opt.value)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                                active
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700',
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                        </button>
                    )
                })}
            </div>

            {/* Mais filtros */}
            <button
                onClick={onToggleMoreFilters}
                className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all',
                    moreFiltersOpen
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                )}
            >
                <ListFilter className="h-4 w-4" />
                Mais filtros
                {moreFiltersCount > 0 && (
                    <span className="text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                        {moreFiltersCount}
                    </span>
                )}
            </button>

            <div className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                {isLoading ? 'Carregando...' : `${taskCount} ${taskCount === 1 ? 'tarefa' : 'tarefas'}`}
            </div>
        </div>
    )
}
