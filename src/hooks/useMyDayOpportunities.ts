import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { differenceInDays } from 'date-fns'

import type { Database } from '../database.types'

type Product = Database['public']['Enums']['app_product']

export interface MyDayOpportunity {
    id: string
    titulo: string
    descricao: string | null
    source_type: 'lost_future' | 'won_upsell'
    scheduled_date: string
    sub_card_mode: 'incremental' | 'complete' | null
    source_card_id: string
    source_card_titulo: string
    days_until: number
}

/**
 * Hook that fetches pending future opportunities assigned to the current user
 * for the next 30 days.
 */
export function useMyDayOpportunities(productFilter: Product) {
    const { profile } = useAuth()

    const query = useQuery({
        queryKey: ['my-day-opportunities', profile?.id, productFilter],
        queryFn: async () => {
            if (!profile?.id) return []

            const now = new Date()
            const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('future_opportunities')
                .select(`
                    id, titulo, descricao, source_type, scheduled_date,
                    sub_card_mode, source_card_id,
                    source_card:cards!future_opportunities_source_card_id_fkey(id, titulo, produto)
                `)
                .eq('responsavel_id', profile.id)
                .eq('status', 'pending')
                .lte('scheduled_date', futureLimit.toISOString().split('T')[0])
                .order('scheduled_date', { ascending: true })

            if (error) throw error

            let result = data || []

            // Filter by product
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((o: any) => o.source_card?.produto === productFilter)
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return result.map((o: any) => ({
                id: o.id,
                titulo: o.titulo,
                descricao: o.descricao,
                source_type: o.source_type,
                scheduled_date: o.scheduled_date,
                sub_card_mode: o.sub_card_mode,
                source_card_id: o.source_card?.id || o.source_card_id,
                source_card_titulo: o.source_card?.titulo || '',
                days_until: differenceInDays(new Date(o.scheduled_date), now),
            })) as MyDayOpportunity[]
        },
        staleTime: 1000 * 60 * 5, // 5 min
        enabled: !!profile?.id,
    })

    return {
        opportunities: query.data || [],
        count: (query.data || []).length,
        isLoading: query.isLoading,
    }
}
