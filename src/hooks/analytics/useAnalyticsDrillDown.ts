import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──────────────────────────────────────────────

export type DrillSource = 'default' | 'stage_entries' | 'closed_deals' | 'current_stage' | 'lost_deals' | 'macro_funnel'

export interface DrillDownContext {
    label: string
    drillSource?: DrillSource
    drillStageId?: string
    drillOwnerId?: string
    drillLossReason?: string
    drillStatus?: string
    drillPhase?: string
    drillPeriodStart?: string
    drillPeriodEnd?: string
    drillDestino?: string
    excludeTerminal?: boolean
    /** Referência temporal (Funil v3). 'stage' | 'created'. */
    drillDateRef?: 'stage' | 'created'
    /** Etapa raiz do Funil v3 ("Desde X"): só cards que passaram por essa etapa. */
    drillRootStageId?: string
    /** Status filter do Funil v3. NULL = todos. Ex: ['aberto']/['ganho']/['perdido']. */
    drillStatusArray?: string[]
    /** Sub-filtro de ganhos do Funil v3: 'sdr'|'planner'|'pos'. */
    drillGanhoFase?: 'sdr' | 'planner' | 'pos'
}

export interface DrillDownCard {
    id: string
    titulo: string
    produto: string
    status_comercial: string
    etapa_nome: string
    fase: string
    dono_atual_nome: string
    valor_display: number
    receita: number
    created_at: string
    data_fechamento: string | null
    pessoa_nome: string | null
    pessoa_telefone: string | null
    total_count: number
    stage_entered_at: string | null
}

interface DrillDownState {
    isOpen: boolean
    context: DrillDownContext | null
    page: number
    sortBy: string
    sortDir: 'asc' | 'desc'
    open: (ctx: DrillDownContext) => void
    close: () => void
    setPage: (p: number) => void
    toggleSort: (column: string) => void
}

// ── Zustand Store ──────────────────────────────────────

export const useDrillDownStore = create<DrillDownState>()((set, get) => ({
    isOpen: false,
    context: null,
    page: 0,
    sortBy: 'created_at',
    sortDir: 'desc',
    open: (ctx) => {
        const sortBy = ctx.drillSource === 'current_stage' ? 'stage_entered_at'
            : ctx.drillSource === 'closed_deals' ? 'data_fechamento'
            : 'created_at'
        const sortDir = ctx.drillSource === 'current_stage' ? 'asc' as const : 'desc' as const
        set({ isOpen: true, context: ctx, page: 0, sortBy, sortDir })
    },
    close: () => set({ isOpen: false, context: null }),
    setPage: (page) => set({ page }),
    toggleSort: (column) => {
        const { sortBy, sortDir } = get()
        if (sortBy === column) {
            set({ sortDir: sortDir === 'desc' ? 'asc' : 'desc', page: 0 })
        } else {
            set({ sortBy: column, sortDir: 'desc', page: 0 })
        }
    },
}))

// ── React Query Hook ───────────────────────────────────

const PAGE_SIZE = 50

export function useAnalyticsDrillDownQuery() {
    const { isOpen, context, page, sortBy, sortDir } = useDrillDownStore()
    const { dateRange, product, mode, stageId, ownerId, ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: [
            'analytics', 'drill-down',
            dateRange.start, dateRange.end, product, mode, stageId, ownerId, ownerIds, tagIds,
            context?.drillSource, context?.drillStageId, context?.drillOwnerId,
            context?.drillLossReason, context?.drillStatus, context?.drillPhase,
            context?.drillPeriodStart, context?.drillPeriodEnd, context?.drillDestino,
            context?.excludeTerminal, context?.drillDateRef,
            context?.drillRootStageId, context?.drillStatusArray, context?.drillGanhoFase,
            sortBy, sortDir, page,
        ],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('analytics_drill_down_cards', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product,
                p_mode: mode,
                p_global_stage_id: stageId,
                p_global_owner_id: ownerId,
                p_drill_stage_id: context?.drillStageId ?? null,
                p_drill_owner_id: context?.drillOwnerId ?? null,
                p_drill_loss_reason: context?.drillLossReason ?? null,
                p_drill_status: context?.drillStatus ?? null,
                p_drill_phase: context?.drillPhase ?? null,
                p_drill_period_start: context?.drillPeriodStart ?? null,
                p_drill_period_end: context?.drillPeriodEnd ?? null,
                p_drill_source: context?.drillSource ?? 'default',
                p_drill_destino: context?.drillDestino ?? null,
                p_exclude_terminal: context?.excludeTerminal ?? false,
                p_sort_by: sortBy,
                p_sort_dir: sortDir,
                p_limit: PAGE_SIZE,
                p_offset: page * PAGE_SIZE,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_date_ref: context?.drillDateRef ?? 'stage',
                p_drill_root_stage_id: context?.drillRootStageId ?? null,
                p_drill_status_array: context?.drillStatusArray && context.drillStatusArray.length > 0
                    ? context.drillStatusArray
                    : null,
                p_drill_ganho_fase: context?.drillGanhoFase ?? null,
            })
            if (error) throw error
            const rows = (data as unknown as DrillDownCard[]) || []
            const totalCount = rows.length > 0 ? rows[0].total_count : 0
            return { rows, totalCount, totalPages: Math.ceil(totalCount / PAGE_SIZE) }
        },
        enabled: isOpen && !!context,
        staleTime: 2 * 60 * 1000,
        retry: 1,
    })
}
