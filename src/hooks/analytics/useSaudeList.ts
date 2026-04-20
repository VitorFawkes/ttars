import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export type SaudeBucket =
    | 'sem_dono'
    | 'sem_contato'
    | 'sla_violado'
    | 'sem_atividade_7d'
    | 'sem_atividade_14d'
    | 'sem_atividade_30d'
    | 'sem_briefing'

export type SaudeSortBy = 'dias_parado' | 'valor' | 'dono'

export interface SaudeCardRow {
    card_id: string
    titulo: string
    stage_id: string
    stage_nome: string
    phase_slug: string | null
    dono_atual_id: string | null
    dono_atual_nome: string | null
    pessoa_nome: string | null
    valor_display: number
    stage_entered_at: string | null
    updated_at: string
    dias_parado: number
    sla_hours: number | null
    horas_sla_excedidas: number | null
    total_count: number
}

const PAGE_SIZE = 50

export function useSaudeList(bucket: SaudeBucket | null, page: number, sortBy: SaudeSortBy = 'dias_parado') {
    const { ownerIds, tagIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'saude-list', bucket, page, sortBy, ownerIds, tagIds],
        queryFn: async () => {
            if (!bucket) return { rows: [] as SaudeCardRow[], totalCount: 0 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_saude_list', {
                p_bucket: bucket,
                p_limit: PAGE_SIZE,
                p_offset: page * PAGE_SIZE,
                p_sort_by: sortBy,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            const rows = (data as unknown as SaudeCardRow[]) || []
            const totalCount = rows.length > 0 ? rows[0].total_count : 0
            return { rows, totalCount, totalPages: Math.ceil(totalCount / PAGE_SIZE), pageSize: PAGE_SIZE }
        },
        enabled: !!bucket,
        staleTime: 60 * 1000,
        retry: 1,
    })
}
