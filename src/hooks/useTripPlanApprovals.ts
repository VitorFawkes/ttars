/**
 * useTripPlanApprovals — Hooks para gerenciar aprovações do portal.
 *
 * Operador: cria itens pendentes de aprovação.
 * Cliente: aprova ou recusa via RPC com token público.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface TripPlanApproval {
    id: string
    trip_plan_id: string
    block_id: string | null
    title: string
    description: string | null
    approval_data: Record<string, unknown>
    status: 'pending' | 'approved' | 'rejected'
    client_notes: string | null
    created_by: string | null
    resolved_at: string | null
    created_at: string
}

/**
 * Lista aprovações de um trip plan (para o editor interno).
 */
export function useTripPlanApprovalsList(tripPlanId: string | undefined) {
    return useQuery({
        queryKey: ['trip-plan-approvals', tripPlanId],
        queryFn: async (): Promise<TripPlanApproval[]> => {
            if (!tripPlanId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from as any)('trip_plan_approvals')
                .select('*')
                .eq('trip_plan_id', tripPlanId)
                .order('created_at', { ascending: false })

            if (error) throw error
            return (data || []) as TripPlanApproval[]
        },
        enabled: !!tripPlanId,
    })
}

/**
 * Cria um item pendente de aprovação (operador envia para cliente).
 */
export function useCreateApproval() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            tripPlanId,
            blockId,
            title,
            description,
            approvalData,
        }: {
            tripPlanId: string
            blockId?: string
            title: string
            description?: string
            approvalData?: Record<string, unknown>
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from as any)('trip_plan_approvals').insert({
                trip_plan_id: tripPlanId,
                block_id: blockId || null,
                title,
                description: description || null,
                approval_data: approvalData || {},
                status: 'pending',
            })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trip-plan-approvals'] })
            queryClient.invalidateQueries({ queryKey: ['portal-public'] })
            toast.success('Item enviado para aprovação do cliente')
        },
        onError: (error: Error) => {
            toast.error('Erro ao enviar para aprovação', { description: error.message })
        },
    })
}

/**
 * Cliente resolve (aprova ou recusa) um item pendente via token público.
 */
export function useResolveApproval() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            token,
            approvalId,
            action,
            notes,
        }: {
            token: string
            approvalId: string
            action: 'approve' | 'reject'
            notes?: string
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('resolve_portal_approval', {
                p_token: token,
                p_approval_id: approvalId,
                p_action: action,
                p_notes: notes || null,
            })
            if (error) throw error
            if (data?.error) throw new Error(data.error)
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['portal-public'] })
            queryClient.invalidateQueries({ queryKey: ['trip-plan-approvals'] })
            const msg = variables.action === 'approve' ? 'Item aprovado' : 'Item recusado'
            toast.success(msg)
        },
        onError: (error: Error) => {
            toast.error('Erro ao resolver item', { description: error.message })
        },
    })
}
