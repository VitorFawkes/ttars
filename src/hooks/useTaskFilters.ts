import { create } from 'zustand'

export type TaskDeadlineFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'no_date'
export type TaskStatusFilter = 'pending' | 'completed'

export interface TaskFilterState {
    search: string
    deadlineFilter: TaskDeadlineFilter
    statusFilter: TaskStatusFilter
    tipos: string[]
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
    tipos: [],
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
