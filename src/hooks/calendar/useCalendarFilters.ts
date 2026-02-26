import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    startOfDay, endOfDay, addMonths, subMonths,
    addWeeks, subWeeks, addDays, subDays
} from 'date-fns'

export type CalendarViewMode = 'month' | 'week' | 'day'

export type MeetingStatus = 'agendada' | 'realizada' | 'cancelada' | 'reagendada' | 'nao_compareceu'

export interface CalendarFiltersState {
    viewMode: CalendarViewMode
    currentDate: string
    teamView: boolean
    selectedUserIds: string[]
    statusFilter: MeetingStatus[]
    search: string

    setViewMode: (mode: CalendarViewMode) => void
    setCurrentDate: (date: string) => void
    goToday: () => void
    goNext: () => void
    goPrev: () => void
    setTeamView: (team: boolean) => void
    setSelectedUserIds: (ids: string[]) => void
    toggleUserFilter: (userId: string) => void
    setStatusFilter: (statuses: MeetingStatus[]) => void
    toggleStatus: (status: MeetingStatus) => void
    setSearch: (search: string) => void
    clearFilters: () => void
    hasActiveFilters: () => boolean
    reset: () => void
}

const initialFilters = {
    viewMode: 'week' as CalendarViewMode,
    currentDate: new Date().toISOString(),
    teamView: false,
    selectedUserIds: [] as string[],
    statusFilter: [] as MeetingStatus[],
    search: '',
}

export const useCalendarFilters = create<CalendarFiltersState>()(
    persist(
        (set, get) => ({
            ...initialFilters,

            setViewMode: (viewMode) => set({ viewMode }),

            setCurrentDate: (currentDate) => set({ currentDate }),

            goToday: () => set({ currentDate: new Date().toISOString() }),

            goNext: () => {
                const { viewMode, currentDate } = get()
                const date = new Date(currentDate)
                const next = viewMode === 'month'
                    ? addMonths(date, 1)
                    : viewMode === 'week'
                        ? addWeeks(date, 1)
                        : addDays(date, 1)
                set({ currentDate: next.toISOString() })
            },

            goPrev: () => {
                const { viewMode, currentDate } = get()
                const date = new Date(currentDate)
                const prev = viewMode === 'month'
                    ? subMonths(date, 1)
                    : viewMode === 'week'
                        ? subWeeks(date, 1)
                        : subDays(date, 1)
                set({ currentDate: prev.toISOString() })
            },

            setTeamView: (teamView) => set({ teamView, selectedUserIds: teamView ? get().selectedUserIds : [] }),

            setSelectedUserIds: (selectedUserIds) => set({ selectedUserIds }),

            toggleUserFilter: (userId) => {
                const { selectedUserIds } = get()
                const updated = selectedUserIds.includes(userId)
                    ? selectedUserIds.filter(id => id !== userId)
                    : [...selectedUserIds, userId]
                set({ selectedUserIds: updated })
            },

            setStatusFilter: (statusFilter) => set({ statusFilter }),

            toggleStatus: (status) => {
                const { statusFilter } = get()
                const updated = statusFilter.includes(status)
                    ? statusFilter.filter(s => s !== status)
                    : [...statusFilter, status]
                set({ statusFilter: updated })
            },

            setSearch: (search) => set({ search }),

            clearFilters: () => set({
                statusFilter: [],
                selectedUserIds: [],
                search: '',
            }),

            hasActiveFilters: () => {
                const { statusFilter, selectedUserIds, search } = get()
                return statusFilter.length > 0 || selectedUserIds.length > 0 || search.length > 0
            },

            reset: () => set({ ...initialFilters }),
        }),
        {
            name: 'calendar-filters-storage',
            partialize: (state) => ({
                viewMode: state.viewMode,
                teamView: state.teamView,
                // Don't persist: currentDate (always start fresh), selectedUserIds (may be stale),
                // statusFilter (user preference), search (transient)
            }),
        }
    )
)

/** Compute date range for current view */
export function getDateRange(viewMode: CalendarViewMode, currentDate: string) {
    const date = new Date(currentDate)
    const weekOptions = { weekStartsOn: 1 as const } // Monday start

    switch (viewMode) {
        case 'month': {
            const monthStart = startOfMonth(date)
            const monthEnd = endOfMonth(date)
            return {
                start: startOfWeek(monthStart, weekOptions).toISOString(),
                end: endOfWeek(monthEnd, weekOptions).toISOString(),
            }
        }
        case 'week':
            return {
                start: startOfWeek(date, weekOptions).toISOString(),
                end: endOfWeek(date, weekOptions).toISOString(),
            }
        case 'day':
            return {
                start: startOfDay(date).toISOString(),
                end: endOfDay(date).toISOString(),
            }
    }
}
