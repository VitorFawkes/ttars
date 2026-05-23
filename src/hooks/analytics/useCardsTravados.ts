import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface CardTravadoRow {
    card_id: string
    titulo: string
    dono_atual_nome: string | null
    stage_atual_nome: string
    phase_slug: string
    dias_travado: number
    falta_orcamento: boolean
    falta_data_prev: boolean
    valor_estimado: number
    total_count: number
}

export interface CardsTravadosSummary {
    rows: CardTravadoRow[]
    totalCount: number
}

export function useCardsTravados() {
    const { ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'cards-travados', ownerIds],
        queryFn: async (): Promise<CardsTravadosSummary> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_cards_travados', {
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_limit: 50,
            })
            if (error) throw error
            const rows = (data as unknown as CardTravadoRow[]) || []
            return {
                rows,
                totalCount: rows[0]?.total_count ?? 0,
            }
        },
        staleTime: 60 * 1000,
        retry: 1,
    })
}
