import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyScopeCascade } from '../lib/filterCascadeRules'

export type ViewMode = 'AGENT' | 'MANAGER'
export type SubView = 'MY_QUEUE' | 'MY_ASSISTS' | 'ATTENTION' | 'TEAM_VIEW' | 'FORECAST' | 'ALL'

export type SortBy = 'created_at' | 'updated_at' | 'data_viagem_inicio' | 'data_proxima_tarefa' | 'data_fechamento' | 'titulo' | 'valor_estimado' | 'dias_ate_viagem' | 'tempo_etapa_dias'
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
    milestones?: string[] // Marcos do funil: 'ganho_sdr' | 'ganho_planner' | 'ganho_pos'
    taskStatus?: string[] // 'atrasada' | 'para_hoje' | 'em_dia' | 'sem_tarefa'
    valorMin?: number
    valorMax?: number
    diasSemContato?: number // Filtro: mostrar cards com tempo_sem_contato >= N
    diasAteViagem?: number // Filtro: mostrar cards com dias_ate_viagem <= N
}

export type ArrayFilterField = Exclude<{
    [K in keyof FilterState]: FilterState[K] extends string[] | undefined ? K : never
}[keyof FilterState], undefined>

export interface GroupFilters {
    showGroupMembers: boolean  // Viajantes vinculados a um grupo (parent_card_id + card_type != sub_card)
    showSubCards: boolean      // Sub-cards: vendas adicionais / mudanças (card_type = sub_card)
    showSolo: boolean          // Cards avulsos (sem parent_card_id)
}

interface PipelineFiltersState {
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    groupFilters: GroupFilters
    showClosedCards: boolean
    showWonDirect: boolean
    collapsedPhases: string[]
    _phaseAutoApplied: boolean // Flag interna: phaseFilters já foi auto-aplicado para o usuário atual
    setViewMode: (mode: ViewMode) => void
    setSubView: (view: SubView) => void
    setFilters: (filters: FilterState) => void
    setGroupFilters: (filters: GroupFilters) => void
    setCollapsedPhases: (phases: string[]) => void
    setAll: (state: Partial<PipelineFiltersState>) => void
    reset: () => void
    // Novas actions — Fase 1
    updateFilter: (partial: Partial<FilterState>) => void
    toggleFilterValue: (field: ArrayFilterField, value: string) => void
    removeFilter: (key: keyof FilterState) => void
    setScopeView: (viewMode: ViewMode, subView: SubView) => string[]
    setShowClosedCards: (value: boolean) => void
    setShowWonDirect: (value: boolean) => void
}



export const initialState: Omit<PipelineFiltersState, 'setViewMode' | 'setSubView' | 'setFilters' | 'setGroupFilters' | 'setCollapsedPhases' | 'setAll' | 'reset' | 'updateFilter' | 'toggleFilterValue' | 'removeFilter' | 'setScopeView' | 'setShowClosedCards' | 'setShowWonDirect'> = {
    viewMode: 'AGENT',
    subView: 'MY_QUEUE',
    filters: {
        sortBy: 'created_at',
        sortDirection: 'desc'
    },
    groupFilters: {
        showGroupMembers: true,
        showSubCards: true,
        showSolo: true,
    },
    showClosedCards: false,
    showWonDirect: false,
    collapsedPhases: [],
    _phaseAutoApplied: false
}

export const usePipelineFilters = create<PipelineFiltersState>()(
    persist(
    (set, get) => ({
    ...initialState,
    setViewMode: (mode) => set({ viewMode: mode }),
    setSubView: (view) => set({ subView: view }),
    setFilters: (filters) => set({ filters }),
    setGroupFilters: (groupFilters) => set({ groupFilters }),
    setCollapsedPhases: (phases) => set({ collapsedPhases: phases }),
    setAll: (state) => set((prev) => ({ ...prev, ...state })),
    reset: () => set(initialState),

    // Merge parcial — nao substitui todo o objeto filters
    updateFilter: (partial) => set((prev) => ({
        filters: { ...prev.filters, ...partial }
    })),

    // Toggle unico em array (add/remove)
    toggleFilterValue: (field, value) => set((prev) => {
        const current = (prev.filters[field] as string[] | undefined) || []
        const updated = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value]

        // Mutual exclusion: tag selecionada limpa noTag
        const extra: Partial<FilterState> = field === 'tagIds' ? { noTag: undefined } : {}

        return { filters: { ...prev.filters, [field]: updated, ...extra } }
    }),

    // Remove filtro inteiro por key
    removeFilter: (key) => set((prev) => {
        const newFilters = { ...prev.filters }
        delete newFilters[key]
        return { filters: newFilters }
    }),

    // Troca de visao COM cascading inteligente
    setScopeView: (viewMode, subView) => {
        const { filters } = get()
        const { filters: cascaded, cleared } = applyScopeCascade(filters, subView)
        set({ viewMode, subView, filters: cascaded })
        return cleared
    },

    // Quick toggles com cascading de statusComercial
    setShowClosedCards: (value) => set((prev) => {
        const updates: Partial<PipelineFiltersState> = {
            showClosedCards: value,
        }
        if (value) {
            updates.showWonDirect = false
            // Limpa statusComercial — Finalizados mostra todos
            if (prev.filters.statusComercial?.length) {
                updates.filters = { ...prev.filters, statusComercial: undefined }
            }
        }
        return updates
    }),

    setShowWonDirect: (value) => set((prev) => {
        const updates: Partial<PipelineFiltersState> = {
            showWonDirect: value,
        }
        if (value) {
            updates.showClosedCards = false
            // Limpa statusComercial — Sem Pos ja implica ganho
            if (prev.filters.statusComercial?.length) {
                updates.filters = { ...prev.filters, statusComercial: undefined }
            }
        }
        return updates
    }),
    }),
    {
        name: 'pipeline-filters-storage',
        partialize: (state) => ({
            viewMode: state.viewMode,
            subView: state.subView,
            filters: { ...state.filters, search: undefined },
            groupFilters: state.groupFilters,
            showClosedCards: state.showClosedCards,
            showWonDirect: state.showWonDirect,
            collapsedPhases: state.collapsedPhases,
        }),
        merge: (persisted, current) => {
            const saved = persisted as Partial<PipelineFiltersState>
            // Migra groupFilters do formato antigo (showLinked/showSolo)
            if (saved.groupFilters && 'showLinked' in saved.groupFilters) {
                saved.groupFilters = {
                    showGroupMembers: true,
                    showSubCards: true,
                    showSolo: true,
                }
            }
            return { ...(current as PipelineFiltersState), ...saved }
        },
    }
    )
)

/** Campos que NAO contam como "filtro ativo" para o badge */
const NON_FILTER_KEYS = new Set<keyof FilterState>([
    'sortBy', 'sortDirection', 'showArchived', 'phaseFilters',
])

/** Selector: conta quantos filtros estao ativos (para badge) */
export function useActiveFilterCount(): number {
    const filters = usePipelineFilters(s => s.filters)
    let count = 0
    for (const [key, val] of Object.entries(filters)) {
        if (NON_FILTER_KEYS.has(key as keyof FilterState)) continue
        if (val == null) continue
        if (Array.isArray(val) && val.length === 0) continue
        if (val === '') continue
        count++
    }
    return count
}
