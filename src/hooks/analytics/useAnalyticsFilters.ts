import { create } from 'zustand'
import { startOfMonth, subMonths, endOfDay, startOfYear } from 'date-fns'

export type Granularity = 'day' | 'week' | 'month'
export type DatePreset = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_year' | 'all_time' | 'custom'
export type AnalysisMode = 'entries' | 'cohort' | 'stage_entry' | 'ganho_sdr' | 'ganho_planner' | 'ganho_total'

export interface AnalyticsFiltersState {
    datePreset: DatePreset
    dateRange: { start: string; end: string }
    granularity: Granularity
    product: 'ALL' | 'TRIPS' | 'WEDDING' | 'CORP'
    mode: AnalysisMode
    stageId: string | null
    ownerId: string | null
    origins: string[]
    activeView: string

    setDatePreset: (preset: DatePreset) => void
    setDateRange: (range: { start: string; end: string }) => void
    setGranularity: (g: Granularity) => void
    setProduct: (p: 'ALL' | 'TRIPS' | 'WEDDING' | 'CORP') => void
    setMode: (mode: AnalysisMode) => void
    setModeWithStage: (mode: AnalysisMode, stageId: string | null) => void
    setOwnerId: (id: string | null) => void
    setOrigins: (origins: string[]) => void
    setActiveView: (view: string) => void
    reset: () => void
}

function getDateRangeForPreset(preset: DatePreset): { start: string; end: string } {
    const now = new Date()
    const end = endOfDay(now).toISOString()

    switch (preset) {
        case 'this_month':
            return { start: startOfMonth(now).toISOString(), end }
        case 'last_month': {
            const lastMonth = subMonths(now, 1)
            return { start: startOfMonth(lastMonth).toISOString(), end: startOfMonth(now).toISOString() }
        }
        case 'last_3_months':
            return { start: subMonths(now, 3).toISOString(), end }
        case 'last_6_months':
            return { start: subMonths(now, 6).toISOString(), end }
        case 'this_year':
            return { start: startOfYear(now).toISOString(), end }
        case 'last_year': {
            const lastYear = subMonths(now, 12)
            return { start: startOfYear(lastYear).toISOString(), end: startOfYear(now).toISOString() }
        }
        case 'all_time':
            return { start: '2020-01-01T00:00:00.000Z', end }
        default:
            return { start: subMonths(now, 3).toISOString(), end }
    }
}

const defaultPreset: DatePreset = 'last_3_months'

export const initialFiltersState = {
    datePreset: defaultPreset,
    dateRange: getDateRangeForPreset(defaultPreset),
    granularity: 'month' as Granularity,
    product: 'ALL' as const,
    mode: 'entries' as AnalysisMode,
    stageId: null as string | null,
    ownerId: null as string | null,
    origins: [] as string[],
    activeView: 'overview',
}

export const useAnalyticsFilters = create<AnalyticsFiltersState>()((set) => ({
    ...initialFiltersState,
    setDatePreset: (preset) => set({
        datePreset: preset,
        dateRange: getDateRangeForPreset(preset),
    }),
    setDateRange: (range) => set({ dateRange: range, datePreset: 'custom' }),
    setGranularity: (granularity) => set({ granularity }),
    setProduct: (product) => set({ product }),
    setMode: (mode) => set({ mode, stageId: null }),
    setModeWithStage: (mode, stageId) => set({
        mode,
        stageId: mode === 'stage_entry' ? stageId : null,
    }),
    setOwnerId: (ownerId) => set({ ownerId }),
    setOrigins: (origins) => set({ origins }),
    setActiveView: (activeView) => set({ activeView }),
    reset: () => set(initialFiltersState),
}))
