import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GiftAssignmentFull } from './useAllGiftAssignments'

export type GiftKanbanStatus = 'pendente' | 'preparando' | 'a_enviar' | 'enviado' | 'entregue'

const ALL_QUERY = ['all-gift-assignments']

/** Atualiza o status de 1 presente (DnD do kanban) com optimistic update.
 *  Não trata cancelamento — esse fluxo segue no painel lateral (libera estoque). */
export function useUpdateGiftStatus() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    return useMutation({
        mutationFn: async ({ assignmentId, newStatus }: { assignmentId: string; newStatus: GiftKanbanStatus }) => {
            const updates: Record<string, unknown> = {
                status: newStatus,
                updated_at: new Date().toISOString(),
            }
            if (newStatus === 'enviado') {
                updates.shipped_by = profile?.id
                updates.shipped_at = new Date().toISOString()
            } else if (newStatus === 'entregue') {
                updates.delivered_at = new Date().toISOString()
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update(updates)
                .eq('id', assignmentId)
            if (error) throw error
        },
        onMutate: async ({ assignmentId, newStatus }) => {
            await queryClient.cancelQueries({ queryKey: ALL_QUERY })
            const snapshots = queryClient.getQueriesData<GiftAssignmentFull[]>({ queryKey: ALL_QUERY })
            for (const [key, value] of snapshots) {
                if (!Array.isArray(value)) continue
                queryClient.setQueryData(key, value.map(a =>
                    a.id === assignmentId ? { ...a, status: newStatus } : a
                ))
            }
            // Snapshot do hook useAllGiftAssignments retorna { assignments, isLoading, stats } — invalidação cobre o resto
            return { snapshots }
        },
        onError: (_err, _vars, context) => {
            if (!context) return
            for (const [key, value] of context.snapshots) {
                queryClient.setQueryData(key, value)
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ALL_QUERY })
            queryClient.invalidateQueries({ queryKey: ['card-gifts'] })
            queryClient.invalidateQueries({ queryKey: ['premium-gifts'] })
            queryClient.invalidateQueries({ queryKey: ['gift-metrics'] })
        },
    })
}

/** Atualiza a observação (notes) do pacote de presentes — usado com debounce no textarea do painel. */
export function useUpdateGiftNotes() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ assignmentId, notes }: { assignmentId: string; notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
                .eq('id', assignmentId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ALL_QUERY })
            queryClient.invalidateQueries({ queryKey: ['card-gifts'] })
        },
    })
}
