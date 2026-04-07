import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Resultado resumido da busca de hotel (vem do enrich-hotel mode=search).
 * Campos alinhados com o tipo HotelSummary do providers/types.ts.
 */
export interface HotelSearchResult {
    externalId: string
    name: string
    address?: string
    thumbnailUrl?: string
    provider: string
}

/**
 * Detalhes completos do hotel (vem do enrich-hotel mode=details).
 */
export interface HotelDetailsResult {
    externalId: string
    name: string
    description?: string
    address?: string
    phone?: string
    website?: string
    lat?: number
    lng?: number
    starRating?: number
    guestRating?: number
    reviewsCount?: number
    amenities?: string[]
    photos: Array<{
        url: string
        thumbnailUrl?: string
        width?: number
        height?: number
        alt?: string
        section?: string
    }>
    provider: string
    fetchedAt: string
}

/**
 * Busca hotéis por nome (autocomplete) via edge function enrich-hotel.
 * Usa useQuery com enabled controlado pelo length mínimo da query.
 */
export function useHotelSearch(query: string, opts?: { country?: string; enabled?: boolean }) {
    const trimmed = query.trim()
    const country = opts?.country
    const enabled = (opts?.enabled ?? true) && trimmed.length >= 3

    return useQuery({
        queryKey: ['hotel-search', trimmed, country],
        queryFn: async (): Promise<HotelSearchResult[]> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            const response = await supabase.functions.invoke('enrich-hotel', {
                body: {
                    mode: 'search',
                    query: trimmed,
                    country: opts?.country,
                },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao buscar hotéis')
            }

            return (response.data?.results ?? []) as HotelSearchResult[]
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 min — resultados de autocomplete não mudam rápido
        gcTime: 30 * 60 * 1000,
    })
}

/**
 * Busca detalhes completos de um hotel (fotos HD, amenities, descrição).
 * Usa useMutation porque é uma ação explícita do operador ("Importar dados").
 */
export function useHotelDetails() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (hotelId: string): Promise<HotelDetailsResult> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            const response = await supabase.functions.invoke('enrich-hotel', {
                body: {
                    mode: 'details',
                    hotelId: hotelId,
                },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao buscar detalhes do hotel')
            }

            return response.data?.details as HotelDetailsResult
        },
        onSuccess: (data) => {
            // Cachear resultado no React Query para evitar re-fetch se o operador
            // fechar e reabrir o modal no mesmo hotel
            queryClient.setQueryData(['hotel-details', data.externalId], data)
        },
        onError: (error: Error) => {
            toast.error('Erro ao buscar detalhes do hotel', {
                description: error.message,
            })
        },
    })
}
