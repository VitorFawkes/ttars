import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export type OperationsHealthMotivo = 'data_ausente' | 'etapa_errada'

export interface OperationsHealthRow {
    card_id: string
    titulo: string
    dono_atual_nome: string | null
    stage_atual_id: string | null
    stage_atual_nome: string | null
    stage_esperado_id: string | null
    stage_esperado_nome: string | null
    data_inicio: string | null
    data_fim: string | null
    motivo: OperationsHealthMotivo
    total_count: number
    total_data_ausente: number
    total_etapa_errada: number
}

export interface OperationsHealthSummary {
    rows: OperationsHealthRow[]
    totalCount: number
    totalDataAusente: number
    totalEtapaErrada: number
}

export function useOperationsHealth() {
    const { ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'operations-health', ownerIds],
        queryFn: async (): Promise<OperationsHealthSummary> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_operations_health', {
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_limit: 100,
            })
            if (error) throw error
            const rows = (data as unknown as OperationsHealthRow[]) || []
            return {
                rows,
                totalCount: rows[0]?.total_count ?? 0,
                totalDataAusente: rows[0]?.total_data_ausente ?? 0,
                totalEtapaErrada: rows[0]?.total_etapa_errada ?? 0,
            }
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}
