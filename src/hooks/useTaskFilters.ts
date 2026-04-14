import { create } from 'zustand'

export type TaskDeadlineFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'no_date'
export type TaskStatusFilter = 'pending' | 'completed_today' | 'all'
export type TaskScopeFilter = 'minhas' | 'meu_time' | 'todas'
export type TaskPrioridadeFilter = 'alta' | 'media' | 'baixa'
export type TaskOrigemFilter = 'manual' | 'cadencia' | 'automacao' | 'integracao'

export interface TaskFilterState {
    search: string
    deadlineFilter: TaskDeadlineFilter
    statusFilter: TaskStatusFilter
    scope: TaskScopeFilter
    tipos: string[]
    prioridades: TaskPrioridadeFilter[]
    origens: TaskOrigemFilter[]
    /** Filtrar por slug de fase do time do responsável (SDR, Planner, Pós-venda) */
    fases: string[]
    responsavelIds: string[]
    /** Date range for due date */
    dateFrom?: string
    dateTo?: string
}

interface TaskFiltersStore {
    filters: TaskFilterState
    setFilters: (filters: Partial<TaskFilterState>) => void
    reset: () => void
}

export const initialTaskFilters: TaskFilterState = {
    search: '',
    deadlineFilter: 'all',
    statusFilter: 'pending',
    scope: 'minhas',
    tipos: [],
    prioridades: [],
    origens: [],
    fases: [],
    responsavelIds: [],
}

export const useTaskFilters = create<TaskFiltersStore>()((set) => ({
    filters: { ...initialTaskFilters },
    setFilters: (partial) =>
        set((state) => ({
            filters: { ...state.filters, ...partial },
        })),
    reset: () => set({ filters: { ...initialTaskFilters } }),
}))
