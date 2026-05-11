import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface TripsFilterState {
    search?: string
    startDate?: string
    endDate?: string
    operationalStatus?: string[]
    destinations?: string[]
    sortBy?: 'data_viagem_inicio' | 'created_at' | 'valor_estimado' | 'valor_display'
    sortDirection?: 'asc' | 'desc'
}

interface TripsFiltersStore {
    filters: TripsFilterState
    setFilters: (filters: TripsFilterState) => void
    resetFilters: () => void
}

export const useTripsFilters = create<TripsFiltersStore>()(
    persist(
        (set) => ({
            filters: {
                sortBy: 'data_viagem_inicio',
                sortDirection: 'asc'
            },
            setFilters: (filters) => set({ filters }),
            resetFilters: () => set({ filters: { sortBy: 'data_viagem_inicio', sortDirection: 'asc' } })
        }),
        {
            name: 'trips-filters',
        }
    )
)
