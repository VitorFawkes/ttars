/**
 * useTripPlanBlocks — React Query hooks para trip_plan_blocks.
 *
 * Usado pelo editor para carregar blocos do banco e pelo portal
 * público para exibir blocos publicados.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TripPlanBlock } from '@/hooks/useTripPlanEditor'

/**
 * Carrega todos os blocos de um trip plan (para o editor interno).
 * Requer autenticação.
 */
export function useTripPlanBlocks(tripPlanId: string | undefined) {
    return useQuery({
        queryKey: ['trip-plan-blocks', tripPlanId],
        queryFn: async (): Promise<TripPlanBlock[]> => {
            if (!tripPlanId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from as any)('trip_plan_blocks')
                .select('*')
                .eq('trip_plan_id', tripPlanId)
                .order('ordem')

            if (error) throw error
            return (data || []) as TripPlanBlock[]
        },
        enabled: !!tripPlanId,
    })
}

/**
 * Carrega blocos publicados de um portal via token público.
 * Não requer autenticação — usa RPC get_portal_by_token.
 */
export function usePublicPortal(token: string | undefined) {
    return useQuery({
        queryKey: ['portal-public', token],
        queryFn: async () => {
            if (!token) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('get_portal_by_token', {
                p_token: token,
            })

            if (error) throw error
            if (data?.error) return null

            return data as {
                proposal: {
                    id: string
                    status: string
                    accepted_at: string | null
                    title: string | null
                    metadata: Record<string, unknown> | null
                    trip_plan_id: string
                    trip_plan_status: string
                }
                blocks: Array<{
                    id: string
                    block_type: string
                    parent_day_id: string | null
                    ordem: number
                    data: Record<string, unknown>
                    published_at: string | null
                }>
                approvals: Array<{
                    id: string
                    title: string
                    description: string | null
                    approval_data: Record<string, unknown>
                    status: string
                    created_at: string
                }>
                pending_count: number
            }
        },
        enabled: !!token,
        staleTime: 30 * 1000,
    })
}
