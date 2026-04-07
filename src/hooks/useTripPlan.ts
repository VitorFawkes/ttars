import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface TimelineEntry {
    title: string
    type: string
    description?: string
    notes?: string
    date?: string
    time?: string
}

export interface VoucherEntry {
    label: string
    url: string
    type: string
    item_id?: string
}

export interface ContactEntry {
    name: string
    role: string
    phone?: string
    email?: string
    notes?: string
}

export interface ChecklistEntry {
    label: string
    checked: boolean
    category?: string
}

export interface TripPlan {
    id: string
    proposal_id: string
    status: 'active' | 'completed' | 'cancelled'
    timeline: TimelineEntry[]
    vouchers: VoucherEntry[]
    contacts: ContactEntry[]
    checklist: ChecklistEntry[]
    updated_at: string
    proposal: {
        id: string
        status: string
        accepted_at?: string
        title?: string
        metadata?: Record<string, unknown>
    }
}

/**
 * Busca trip plan via token público (para a view do cliente /p/:token).
 * Chama RPC get_trip_plan_by_token que valida o token internamente.
 */
export function usePublicTripPlan(token: string) {
    return useQuery({
        queryKey: ['trip-plan-public', token],
        queryFn: async (): Promise<TripPlan | null> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('get_trip_plan_by_token', {
                p_token: token,
            })

            if (error) throw error
            if (data?.error) return null
            return data as TripPlan
        },
        enabled: !!token,
        staleTime: 60 * 1000,
    })
}

/**
 * Busca trip plan por proposal_id (para o editor interno do operador).
 */
export function useTripPlan(proposalId: string | undefined) {
    return useQuery({
        queryKey: ['trip-plan', proposalId],
        queryFn: async (): Promise<TripPlan | null> => {
            if (!proposalId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from as any)('proposal_trip_plans')
                .select('*')
                .eq('proposal_id', proposalId)
                .maybeSingle()

            if (error) throw error
            return data as TripPlan | null
        },
        enabled: !!proposalId,
    })
}

/**
 * Atualiza campos do trip plan (timeline, vouchers, contacts, checklist).
 */
export function useUpdateTripPlan() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: {
            id: string
            timeline?: TimelineEntry[]
            vouchers?: VoucherEntry[]
            contacts?: ContactEntry[]
            checklist?: ChecklistEntry[]
            status?: 'active' | 'completed' | 'cancelled'
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from as any)('proposal_trip_plans')
                .update(updates)
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trip-plan'] })
            queryClient.invalidateQueries({ queryKey: ['trip-plan-public'] })
        },
        onError: (error: Error) => {
            toast.error('Erro ao atualizar portal da viagem', {
                description: error.message,
            })
        },
    })
}
