import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'
import { useProductContext } from '@/hooks/useProductContext'

export interface SaudeSummary {
    sem_dono: number
    sem_contato: number
    sla_violado: number
    sem_atividade_7d: number
    sem_atividade_14d: number
    sem_atividade_30d: number
    tarefas_vencidas: number
    sem_briefing: number
    total_abertos: number
}

export function useSaudeSummary() {
    const { ownerIds, tagIds } = useAnalyticsFilters()
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: ['analytics', 'saude-summary', currentProduct, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_saude_summary', {
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            const first = (Array.isArray(data) ? data[0] : data) as SaudeSummary | undefined
            return first ?? null
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}
