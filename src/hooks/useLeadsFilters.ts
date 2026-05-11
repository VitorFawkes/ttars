import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SortBy = 'created_at' | 'updated_at' | 'data_viagem_inicio' | 'titulo' | 'valor_estimado'
export type SortDirection = 'asc' | 'desc'

export interface LeadsFilterState {
    search?: string
    creationStartDate?: string
    creationEndDate?: string
    ownerIds?: string[]
    stageIds?: string[]
    statusComercial?: string[]
    prioridade?: string[]
    sortBy: SortBy
    sortDirection: SortDirection
    // New filters
    pipelineIds?: string[]
    dataViagemStart?: string
    dataViagemEnd?: string
    valorMin?: number
    valorMax?: number
    diasSemContatoMin?: number
    diasSemContatoMax?: number
    origem?: string[]
    showArchived?: boolean
    tagIds?: string[]
    noTag?: boolean
    // Pagination
    page: number
    pageSize: number
}

interface LeadsFiltersStore {
    filters: LeadsFilterState
    setFilters: (filters: Partial<LeadsFilterState>) => void
    setSearch: (search: string) => void
    toggleOwner: (ownerId: string) => void
    toggleStage: (stageId: string) => void
    toggleStatus: (status: string) => void
    togglePrioridade: (prioridade: string) => void
    togglePipeline: (pipelineId: string) => void
    toggleOrigem: (origem: string) => void
    toggleTag: (tagId: string) => void
    toggleNoTag: () => void
    toggleArchived: () => void
    setPage: (page: number) => void
    setPageSize: (pageSize: number) => void
    clearFilters: () => void
    reset: () => void
    hasActiveFilters: () => boolean
}

const initialFilters: LeadsFilterState = {
    sortBy: 'created_at',
    sortDirection: 'desc',
    page: 1,
    pageSize: 50
}

export const useLeadsFilters = create<LeadsFiltersStore>()(
    persist(
        (set, get) => ({
            filters: initialFilters,

            setFilters: (newFilters) => set((state) => ({
                filters: { ...state.filters, ...newFilters, page: 1 }
            })),

            setSearch: (search) => set((state) => ({
                filters: { ...state.filters, search, page: 1 }
            })),

            toggleOwner: (ownerId) => set((state) => {
                const current = state.filters.ownerIds || []
                const updated = current.includes(ownerId)
                    ? current.filter(id => id !== ownerId)
                    : [...current, ownerId]
                return { filters: { ...state.filters, ownerIds: updated, page: 1 } }
            }),

            toggleStage: (stageId) => set((state) => {
                const current = state.filters.stageIds || []
                const updated = current.includes(stageId)
                    ? current.filter(id => id !== stageId)
                    : [...current, stageId]
                return { filters: { ...state.filters, stageIds: updated, page: 1 } }
            }),

            toggleStatus: (status) => set((state) => {
                const current = state.filters.statusComercial || []
                const updated = current.includes(status)
                    ? current.filter(s => s !== status)
                    : [...current, status]
                return { filters: { ...state.filters, statusComercial: updated, page: 1 } }
            }),

            togglePrioridade: (prioridade) => set((state) => {
                const current = state.filters.prioridade || []
                const updated = current.includes(prioridade)
                    ? current.filter(p => p !== prioridade)
                    : [...current, prioridade]
                return { filters: { ...state.filters, prioridade: updated, page: 1 } }
            }),

            togglePipeline: (pipelineId) => set((state) => {
                const current = state.filters.pipelineIds || []
                const updated = current.includes(pipelineId)
                    ? current.filter(id => id !== pipelineId)
                    : [...current, pipelineId]
                return { filters: { ...state.filters, pipelineIds: updated, page: 1 } }
            }),

            toggleOrigem: (origem) => set((state) => {
                const current = state.filters.origem || []
                const updated = current.includes(origem)
                    ? current.filter(o => o !== origem)
                    : [...current, origem]
                return { filters: { ...state.filters, origem: updated, page: 1 } }
            }),

            toggleTag: (tagId) => set((state) => {
                const current = state.filters.tagIds || []
                const updated = current.includes(tagId)
                    ? current.filter(id => id !== tagId)
                    : [...current, tagId]
                return { filters: { ...state.filters, tagIds: updated, noTag: undefined, page: 1 } }
            }),

            toggleNoTag: () => set((state) => ({
                filters: { ...state.filters, noTag: !state.filters.noTag || undefined, tagIds: undefined, page: 1 }
            })),

            toggleArchived: () => set((state) => ({
                filters: { ...state.filters, showArchived: !state.filters.showArchived, page: 1 }
            })),

            setPage: (page) => set((state) => ({
                filters: { ...state.filters, page }
            })),

            setPageSize: (pageSize) => set((state) => ({
                filters: { ...state.filters, pageSize, page: 1 }
            })),

            clearFilters: () => set({ filters: initialFilters }),

            reset: () => set({ filters: initialFilters }),

            hasActiveFilters: (): boolean => {
                const { filters } = get()
                return Boolean(
                    filters.search ||
                    filters.creationStartDate ||
                    filters.creationEndDate ||
                    (filters.ownerIds?.length ?? 0) > 0 ||
                    (filters.stageIds?.length ?? 0) > 0 ||
                    (filters.statusComercial?.length ?? 0) > 0 ||
                    (filters.prioridade?.length ?? 0) > 0 ||
                    (filters.pipelineIds?.length ?? 0) > 0 ||
                    (filters.origem?.length ?? 0) > 0 ||
                    filters.dataViagemStart ||
                    filters.dataViagemEnd ||
                    filters.valorMin !== undefined ||
                    filters.valorMax !== undefined ||
                    filters.diasSemContatoMin !== undefined ||
                    filters.diasSemContatoMax !== undefined ||
                    filters.showArchived ||
                    (filters.tagIds?.length ?? 0) > 0 ||
                    filters.noTag
                )
            }
        }),
        {
            name: 'leads-filters-storage',
            partialize: (state) => ({ filters: state.filters })
        }
    )
)
