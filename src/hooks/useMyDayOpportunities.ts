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
    source_type: 'lost_future' | 'won_future'
    scheduled_date: string
    sub_card_mode: 'incremental' | 'complete' | null
    source_card_id: string
    source_card_titulo: string
    days_until: number
    responsavel_id: string | null
    responsavel_nome: string | null
}

interface UseMyDayOpportunitiesOptions {
    productFilter: Product
    /** IDs to filter by. undefined = no filter (all). [] = no results. */
    responsavelIds?: string[]
}

/**
 * Hook that fetches pending future opportunities.
 * - responsavelIds = undefined → all opportunities (no filter)
 * - responsavelIds = [userId] → only that user's opportunities
 * - responsavelIds = [a, b, c] → opportunities for those users
 * - responsavelIds = [] → returns empty (waiting for data)
 */
export function useMyDayOpportunities({ productFilter, responsavelIds }: UseMyDayOpportunitiesOptions) {
    const { profile } = useAuth()

    const isReady = responsavelIds === undefined || responsavelIds.length > 0

    const query = useQuery({
        queryKey: ['my-day-opportunities', productFilter, responsavelIds],
        queryFn: async () => {
            if (!profile?.id) return []

            const now = new Date()
            const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase as any)
                .from('future_opportunities')
                .select(`
                    id, titulo, descricao, source_type, scheduled_date,
                    sub_card_mode, source_card_id, responsavel_id,
                    source_card:cards!future_opportunities_source_card_id_fkey(id, titulo, produto),
                    responsavel:profiles!future_opportunities_responsavel_id_fkey(id, nome)
                `)
                .eq('status', 'pending')
                .lte('scheduled_date', futureLimit.toISOString().split('T')[0])
                .order('scheduled_date', { ascending: true })

            // Apply responsavel filter
            if (responsavelIds !== undefined) {
                if (responsavelIds.length === 1) {
                    q = q.eq('responsavel_id', responsavelIds[0])
                } else {
                    q = q.in('responsavel_id', responsavelIds)
                }
            }

            const { data, error } = await q

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
                responsavel_id: o.responsavel_id,
                responsavel_nome: o.responsavel?.nome || null,
            })) as MyDayOpportunity[]
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!profile?.id && isReady,
    })

    return {
        opportunities: query.data || [],
        count: (query.data || []).length,
        isLoading: query.isLoading,
    }
}
