import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useTripsFilters } from './useTripsFilters'
import { useProductContext } from './useProductContext'
import type { Database } from '../database.types'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

export function useTrips() {
    const { filters } = useTripsFilters()
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: ['trips', filters, currentProduct],
        placeholderData: keepPreviousData,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase.from('view_cards_acoes') as any)
                .select('*')
                .eq('status_comercial', 'ganho') // Only Won deals are Trips
                .eq('produto', currentProduct)

            if (filters.search) {
                const searchTerm = filters.search.trim();
                if (searchTerm) {
                    query = query.or(`titulo.ilike.%${searchTerm}%,pessoa_nome.ilike.%${searchTerm}%,origem.ilike.%${searchTerm}%`)
                }
            }

            if ((filters.operationalStatus?.length ?? 0) > 0) {
                query = query.in('estado_operacional', filters.operationalStatus)
            }

            if (filters.startDate) {
                query = query.gte('data_viagem_inicio', filters.startDate)
            }

            if (filters.endDate) {
                query = query.lte('data_viagem_inicio', filters.endDate)
            }

            // Apply Sorting
            if (filters.sortBy) {
                query = query.order(filters.sortBy, { ascending: filters.sortDirection === 'asc', nullsFirst: false })
            } else {
                query = query.order('data_viagem_inicio', { ascending: true })
            }

            const { data, error } = await query
            if (error) throw error

            return data as Card[]
        }
    })
}
