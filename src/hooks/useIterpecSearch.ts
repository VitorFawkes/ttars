import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
    IterpecServiceMode,
    IterpecCriteria,
    IterpecSearchResponse,
    IterpecHotelResult,
    IterpecTransferResult,
    IterpecTourResult,
    IterpecCarResult,
} from '@/types/iterpec'

/**
 * Busca genérica na Iterpec/Cangooroo via Edge Function iterpec-search.
 * Suporta hotel, transfer, tour e car.
 *
 * @param mode - Tipo de serviço
 * @param criteria - Critérios de busca (formato específico por modo)
 * @param enabled - Controle externo de quando disparar a query
 */
export function useIterpecSearch<T>(
    mode: IterpecServiceMode,
    criteria: IterpecCriteria | null,
    enabled = true,
) {
    return useQuery({
        queryKey: ['iterpec-search', mode, criteria],
        queryFn: async (): Promise<IterpecSearchResponse<T>> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            const response = await supabase.functions.invoke('iterpec-search', {
                body: { mode, criteria },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao buscar na Iterpec')
            }

            return response.data as IterpecSearchResponse<T>
        },
        enabled: enabled && criteria !== null,
        staleTime: 5 * 60 * 1000,    // 5 min
        gcTime: 15 * 60 * 1000,       // 15 min (alinhado com cache do backend)
    })
}

/** Busca hotéis na Iterpec com preço real de operadora */
export function useIterpecHotelSearch(
    criteria: IterpecCriteria | null,
    enabled = true,
) {
    return useIterpecSearch<IterpecHotelResult>('hotel', criteria, enabled)
}

/** Busca transfers na Iterpec */
export function useIterpecTransferSearch(
    criteria: IterpecCriteria | null,
    enabled = true,
) {
    return useIterpecSearch<IterpecTransferResult>('transfer', criteria, enabled)
}

/** Busca tours/experiências na Iterpec */
export function useIterpecTourSearch(
    criteria: IterpecCriteria | null,
    enabled = true,
) {
    return useIterpecSearch<IterpecTourResult>('tour', criteria, enabled)
}

/** Busca rent-a-car na Iterpec */
export function useIterpecCarSearch(
    criteria: IterpecCriteria | null,
    enabled = true,
) {
    return useIterpecSearch<IterpecCarResult>('car', criteria, enabled)
}
