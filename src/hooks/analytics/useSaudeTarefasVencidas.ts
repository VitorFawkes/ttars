import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface TarefaVencidaRow {
    tarefa_id: string
    titulo: string
    tipo: string | null
    prioridade: string | null
    data_vencimento: string
    dias_vencida: number
    card_id: string
    card_titulo: string
    responsavel_id: string | null
    responsavel_nome: string | null
    total_count: number
}

const PAGE_SIZE = 50

export function useSaudeTarefasVencidas(page: number, enabled: boolean) {
    const { ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'saude-tarefas-vencidas', page, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_saude_tarefas_vencidas', {
                p_limit: PAGE_SIZE,
                p_offset: page * PAGE_SIZE,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
            })
            if (error) throw error
            const rows = (data as unknown as TarefaVencidaRow[]) || []
            const totalCount = rows.length > 0 ? rows[0].total_count : 0
            return { rows, totalCount, totalPages: Math.ceil(totalCount / PAGE_SIZE), pageSize: PAGE_SIZE }
        },
        enabled,
        staleTime: 60 * 1000,
        retry: 1,
    })
}
