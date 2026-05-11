/**
 * useUnifiedSearch — Busca unificada: biblioteca interna + catálogo externo.
 *
 * O operador digita o nome de um hotel numa única busca e vê resultados
 * de ambas as fontes numa lista só, com badge indicando a origem.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { HotelSearchResult } from '@/hooks/useHotelSearch'

export interface UnifiedSearchResult {
    id: string
    name: string
    description?: string
    thumbnailUrl?: string
    address?: string
    basePrice?: number
    currency?: string
    source: 'library' | 'catalog'
    sourceLabel: string
    // Dados extras para import
    externalId?: string  // para catálogo
    libraryId?: string   // para biblioteca
    rawData?: Record<string, unknown>
}

/**
 * Busca unificada: biblioteca + LiteAPI/Google Places em paralelo.
 * Resultados da biblioteca primeiro, catálogo depois.
 */
export function useUnifiedSearch(
    query: string,
    category?: string,
    opts?: { enabled?: boolean }
) {
    const trimmed = query.trim()
    const enabled = (opts?.enabled ?? true) && trimmed.length >= 3

    return useQuery({
        queryKey: ['unified-search', trimmed, category],
        queryFn: async (): Promise<UnifiedSearchResult[]> => {
            const results: UnifiedSearchResult[] = []

            // 1. Buscar na biblioteca interna (RPC)
            const libraryPromise = (async () => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data } = await (supabase.rpc as any)('search_proposal_library', {
                        search_term: trimmed,
                        category_filter: category || null,
                        destination_filter: null,
                        limit_count: 5,
                    })
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            results.push({
                                id: `lib_${item.id}`,
                                name: item.name,
                                description: item.destination || item.supplier || undefined,
                                thumbnailUrl: item.thumbnail_url || undefined,
                                basePrice: item.base_price ? Number(item.base_price) : undefined,
                                currency: item.currency || 'BRL',
                                source: 'library',
                                sourceLabel: 'Biblioteca',
                                libraryId: item.id,
                                rawData: item,
                            })
                        }
                    }
                } catch {
                    // biblioteca falhou — continuar sem
                }
            })()

            // 2. Buscar no catálogo externo (enrich-hotel)
            const catalogPromise = (async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!session) return

                    const response = await supabase.functions.invoke('enrich-hotel', {
                        body: { mode: 'search', query: trimmed },
                    })
                    if (response.error) return

                    const catalogResults = (response.data?.results ?? []) as HotelSearchResult[]
                    for (const hotel of catalogResults) {
                        results.push({
                            id: `cat_${hotel.externalId}`,
                            name: hotel.name,
                            description: hotel.address || undefined,
                            thumbnailUrl: hotel.thumbnailUrl || undefined,
                            source: 'catalog',
                            sourceLabel: hotel.provider === 'google_places' ? 'Google Maps' : 'Catálogo',
                            externalId: hotel.externalId,
                            rawData: hotel as unknown as Record<string, unknown>,
                        })
                    }
                } catch {
                    // catálogo falhou — continuar sem
                }
            })()

            // Buscar em paralelo
            await Promise.all([libraryPromise, catalogPromise])

            // Ordenar: biblioteca primeiro, depois catálogo
            results.sort((a, b) => {
                if (a.source === 'library' && b.source !== 'library') return -1
                if (a.source !== 'library' && b.source === 'library') return 1
                return 0
            })

            return results
        },
        enabled,
        staleTime: 60 * 1000,
    })
}
