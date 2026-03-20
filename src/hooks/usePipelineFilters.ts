import { create } from 'zustand'

export type ViewMode = 'AGENT' | 'MANAGER'
export type SubView = 'MY_QUEUE' | 'MY_ASSISTS' | 'ATTENTION' | 'TEAM_VIEW' | 'FORECAST' | 'ALL'

export type SortBy = 'created_at' | 'updated_at' | 'data_viagem_inicio' | 'data_proxima_tarefa'
export type SortDirection = 'asc' | 'desc'

export interface FilterState {
    search?: string
    startDate?: string
    endDate?: string
    creationStartDate?: string
    creationEndDate?: string
    ownerId?: string // Legacy single select
    ownerIds?: string[] // Multi-select
    sdrIds?: string[] // Multi-select SDR
    plannerIds?: string[] // Multi-select Planner (vendas_owner_id)
    posIds?: string[] // Multi-select Pós-Venda (pos_owner_id)
    teamIds?: string[]
    departmentIds?: string[]
    phaseFilters?: string[] // phase_ids — filtra pipeline para mostrar apenas essas fases
    sortBy?: SortBy
    sortDirection?: SortDirection
    showArchived?: boolean // Mostrar cards arquivados
    statusComercial?: string[] // Multi-select: aberto, ganho, perdido
    origem?: string[] // Multi-select: mkt, indicacao, carteira_propria, carteira_wg (+ legacy: carteira, manual, outro, site, active_campaign, whatsapp)
    docStatus?: string[] // 'pendente' | 'completo' | 'sem_documentos'
    tagIds?: string[]
    noTag?: boolean
    includeAssists?: boolean // Incluir cards onde o usuário é assistente
    milestones?: string[] // Marcos do funil: 'ganho_sdr' | 'ganho_planner' | 'ganho_pos'
}

export interface GroupFilters {
    showLinked: boolean
    showSolo: boolean
}

interface PipelineFiltersState {
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    groupFilters: GroupFilters
    collapsedPhases: string[]
    _phaseAutoApplied: boolean // Flag interna: phaseFilters já foi auto-aplicado para o usuário atual
    setViewMode: (mode: ViewMode) => void
    setSubView: (view: SubView) => void
    setFilters: (filters: FilterState) => void
    setGroupFilters: (filters: GroupFilters) => void
    setCollapsedPhases: (phases: string[]) => void
    setAll: (state: Partial<PipelineFiltersState>) => void
    reset: () => void
}



export const initialState: Omit<PipelineFiltersState, 'setViewMode' | 'setSubView' | 'setFilters' | 'setGroupFilters' | 'setCollapsedPhases' | 'setAll' | 'reset'> = {
    viewMode: 'AGENT',
    subView: 'MY_QUEUE',
    filters: {
        sortBy: 'created_at',
        sortDirection: 'desc'
    },
    groupFilters: {
        showLinked: true,
        showSolo: true
    },
    collapsedPhases: [],
    _phaseAutoApplied: false
}

export const usePipelineFilters = create<PipelineFiltersState>()((set) => ({
    ...initialState,
    setViewMode: (mode) => set({ viewMode: mode }),
    setSubView: (view) => set({ subView: view }),
    setFilters: (filters) => set({ filters }),
    setGroupFilters: (groupFilters) => set({ groupFilters }),
    setCollapsedPhases: (phases) => set({ collapsedPhases: phases }),
    setAll: (state) => set((prev) => ({ ...prev, ...state })),
    reset: () => set(initialState)
}))
