import { create } from 'zustand'
import type {
    DataSource, DimensionSpec, MeasureSpec, ComputedMeasureSpec,
    FilterSpec, OrderSpec, ComparisonSpec, ReportIQR,
    VisualizationConfig,
} from '@/lib/reports/reportTypes'
import { getDefaultVizConfig } from '@/lib/reports/chartDefaults'

interface ReportBuilderState {
    // IQR
    source: DataSource | null
    dimensions: DimensionSpec[]
    measures: MeasureSpec[]
    computedMeasures: ComputedMeasureSpec[]
    breakdownBy: DimensionSpec | null
    filters: FilterSpec[]
    orderBy: OrderSpec | null
    limit: number
    comparison: ComparisonSpec | null

    // Visualization
    visualization: VisualizationConfig

    // Meta
    editingReportId: string | null
    isDirty: boolean
    title: string
    description: string
    visibility: 'private' | 'team' | 'everyone'

    // Actions — Source
    setSource: (source: DataSource) => void

    // Actions — Dimensions
    addDimension: (dim: DimensionSpec) => void
    removeDimension: (field: string) => void
    updateDimension: (field: string, updates: Partial<DimensionSpec>) => void
    reorderDimensions: (oldIndex: number, newIndex: number) => void

    // Actions — Measures
    addMeasure: (measure: MeasureSpec) => void
    removeMeasure: (field: string) => void
    updateMeasure: (field: string, updates: Partial<MeasureSpec>) => void
    reorderMeasures: (oldIndex: number, newIndex: number) => void

    // Actions — Computed Measures
    addComputedMeasure: (cm: ComputedMeasureSpec) => void
    removeComputedMeasure: (key: string) => void

    // Actions — Breakdown
    setBreakdownBy: (dim: DimensionSpec | null) => void

    // Actions — Filters
    addFilter: (filter: FilterSpec) => void
    removeFilter: (index: number) => void
    updateFilter: (index: number, filter: FilterSpec) => void

    // Actions — Config
    setOrderBy: (order: OrderSpec | null) => void
    setLimit: (limit: number) => void
    setComparison: (comp: ComparisonSpec | null) => void
    setVisualization: (viz: Partial<VisualizationConfig>) => void
    setTitle: (title: string) => void
    setDescription: (desc: string) => void
    setVisibility: (visibility: 'private' | 'team' | 'everyone') => void

    // Actions — Serialization
    loadFromReport: (config: ReportIQR, viz: VisualizationConfig, reportId?: string, title?: string, description?: string, visibility?: 'private' | 'team' | 'everyone') => void
    toIQR: () => ReportIQR | null
    toVisualization: () => VisualizationConfig
    markSaved: () => void
    reset: () => void
}

const initialState = {
    source: null as DataSource | null,
    dimensions: [] as DimensionSpec[],
    measures: [] as MeasureSpec[],
    computedMeasures: [] as ComputedMeasureSpec[],
    breakdownBy: null as DimensionSpec | null,
    filters: [] as FilterSpec[],
    orderBy: null as OrderSpec | null,
    limit: 50,
    comparison: null as ComparisonSpec | null,
    visualization: getDefaultVizConfig('bar_vertical'),
    editingReportId: null as string | null,
    isDirty: false,
    title: '',
    description: '',
    visibility: 'private' as const,
}

export const useReportBuilderStore = create<ReportBuilderState>()((set, get) => ({
    ...initialState,

    // Source
    setSource: (source) => set({
        source,
        dimensions: [],
        measures: [],
        computedMeasures: [],
        breakdownBy: null,
        filters: [],
        orderBy: null,
        isDirty: true,
    }),

    // Dimensions
    addDimension: (dim) => set((s) => {
        if (s.dimensions.some(d => d.field === dim.field)) return s
        return { dimensions: [...s.dimensions, dim], isDirty: true }
    }),
    removeDimension: (field) => set((s) => {
        const updates: Partial<ReportBuilderState> = {
            dimensions: s.dimensions.filter(d => d.field !== field),
            isDirty: true,
        }
        // Clean orphan breakdownBy
        if (s.breakdownBy?.field === field) updates.breakdownBy = null
        // Clean orphan orderBy
        if (s.orderBy?.field === field) updates.orderBy = null
        return updates
    }),
    updateDimension: (field, updates) => set((s) => ({
        dimensions: s.dimensions.map(d => d.field === field ? { ...d, ...updates } : d),
        isDirty: true,
    })),
    reorderDimensions: (oldIndex, newIndex) => set((s) => {
        const arr = [...s.dimensions]
        const [moved] = arr.splice(oldIndex, 1)
        arr.splice(newIndex, 0, moved)
        return { dimensions: arr, isDirty: true }
    }),

    // Measures
    addMeasure: (measure) => set((s) => {
        if (s.measures.some(m => m.field === measure.field)) return s
        return { measures: [...s.measures, measure], isDirty: true }
    }),
    removeMeasure: (field) => set((s) => {
        const updates: Partial<ReportBuilderState> = {
            measures: s.measures.filter(m => m.field !== field),
            isDirty: true,
        }
        // Clean orphan orderBy
        if (s.orderBy?.field === field) updates.orderBy = null
        return updates
    }),
    updateMeasure: (field, updates) => set((s) => ({
        measures: s.measures.map(m => m.field === field ? { ...m, ...updates } : m),
        isDirty: true,
    })),
    reorderMeasures: (oldIndex, newIndex) => set((s) => {
        const arr = [...s.measures]
        const [moved] = arr.splice(oldIndex, 1)
        arr.splice(newIndex, 0, moved)
        return { measures: arr, isDirty: true }
    }),

    // Computed Measures
    addComputedMeasure: (cm) => set((s) => ({
        computedMeasures: [...s.computedMeasures, cm],
        isDirty: true,
    })),
    removeComputedMeasure: (key) => set((s) => ({
        computedMeasures: s.computedMeasures.filter(cm => cm.key !== key),
        isDirty: true,
    })),

    // Breakdown
    setBreakdownBy: (dim) => set({ breakdownBy: dim, isDirty: true }),

    // Filters
    addFilter: (filter) => set((s) => ({
        filters: [...s.filters, filter],
        isDirty: true,
    })),
    removeFilter: (index) => set((s) => ({
        filters: s.filters.filter((_, i) => i !== index),
        isDirty: true,
    })),
    updateFilter: (index, filter) => set((s) => ({
        filters: s.filters.map((f, i) => i === index ? filter : f),
        isDirty: true,
    })),

    // Config
    setOrderBy: (orderBy) => set({ orderBy, isDirty: true }),
    setLimit: (limit) => set({ limit: Math.min(Math.max(1, limit), 5000), isDirty: true }),
    setComparison: (comparison) => set({ comparison, isDirty: true }),
    setVisualization: (viz) => set((s) => ({
        visualization: { ...s.visualization, ...viz },
        isDirty: true,
    })),
    setTitle: (title) => set({ title, isDirty: true }),
    setDescription: (description) => set({ description, isDirty: true }),
    setVisibility: (visibility) => set({ visibility, isDirty: true }),

    // Serialization
    loadFromReport: (config, viz, reportId, title, description, visibility) => set({
        source: config.source,
        dimensions: config.dimensions,
        measures: config.measures,
        computedMeasures: config.computedMeasures ?? [],
        breakdownBy: config.breakdownBy ?? null,
        filters: config.filters,
        orderBy: config.orderBy ?? null,
        limit: config.limit,
        comparison: config.comparison ?? null,
        visualization: viz,
        editingReportId: reportId ?? null,
        isDirty: false,
        title: title ?? '',
        description: description ?? '',
        visibility: visibility ?? 'private',
    }),

    toIQR: (): ReportIQR | null => {
        const s = get()
        if (!s.source) return null
        return {
            source: s.source,
            dimensions: s.dimensions,
            measures: s.measures,
            computedMeasures: s.computedMeasures.length > 0 ? s.computedMeasures : undefined,
            breakdownBy: s.breakdownBy ?? undefined,
            filters: s.filters,
            orderBy: s.orderBy ?? undefined,
            limit: s.limit,
            comparison: s.comparison ?? undefined,
        }
    },

    toVisualization: () => get().visualization,

    markSaved: () => set({ isDirty: false }),

    reset: () => set({ ...initialState, visualization: getDefaultVizConfig('bar_vertical') }),
}))
