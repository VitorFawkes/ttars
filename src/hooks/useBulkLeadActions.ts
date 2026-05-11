import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface BulkMoveStageParams {
    cardIds: string[]
    stageId: string
}

interface BulkChangeOwnerParams {
    cardIds: string[]
    ownerId: string
}

interface BulkChangePriorityParams {
    cardIds: string[]
    prioridade: 'alta' | 'media' | 'baixa'
}

interface BulkDeleteParams {
    cardIds: string[]
}

export function useBulkLeadActions() {
    const queryClient = useQueryClient()

    const invalidateQueries = () => {
        queryClient.invalidateQueries({ queryKey: ['leads'] })
        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.invalidateQueries({ queryKey: ['deleted-cards'] })
    }

    // Bulk Move Stage - uses RPC for each card to maintain business logic
    const bulkMoveStage = useMutation({
        mutationFn: async ({ cardIds, stageId }: BulkMoveStageParams) => {
            const results: { success: string[], failed: string[] } = { success: [], failed: [] }

            // Process in parallel with Promise.allSettled for better performance
            const promises = cardIds.map(async (cardId) => {
                const { error } = await (supabase.rpc as any)('mover_card', {
                    p_card_id: cardId,
                    p_nova_etapa_id: stageId,
                    p_motivo_perda_id: null,
                    p_motivo_perda_comentario: null
                })
                if (error) throw { cardId, error }
                return cardId
            })

            const settled = await Promise.allSettled(promises)

            settled.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.success.push(result.value)
                } else {
                    results.failed.push(cardIds[index])
                }
            })

            return results
        },
        onSuccess: (results) => {
            if (results.failed.length === 0) {
                toast.success(`${results.success.length} leads movidos com sucesso!`)
            } else {
                toast.warning(`${results.success.length} movidos, ${results.failed.length} falharam`)
            }
            invalidateQueries()
        },
        onError: (error: Error) => {
            toast.error('Erro ao mover leads: ' + error.message)
        }
    })

    // Bulk Change Owner - direct update for efficiency
    const bulkChangeOwner = useMutation({
        mutationFn: async ({ cardIds, ownerId }: BulkChangeOwnerParams) => {
            const { error } = await supabase
                .from('cards')
                .update({ dono_atual_id: ownerId })
                .in('id', cardIds)

            if (error) throw error
            return cardIds.length
        },
        onSuccess: (count) => {
            toast.success(`Responsável alterado em ${count} leads!`)
            invalidateQueries()
        },
        onError: (error: Error) => {
            toast.error('Erro ao alterar responsável: ' + error.message)
        }
    })

    // Bulk Change Priority
    const bulkChangePriority = useMutation({
        mutationFn: async ({ cardIds, prioridade }: BulkChangePriorityParams) => {
            const { error } = await supabase
                .from('cards')
                .update({ prioridade })
                .in('id', cardIds)

            if (error) throw error
            return cardIds.length
        },
        onSuccess: (count) => {
            toast.success(`Prioridade alterada em ${count} leads!`)
            invalidateQueries()
        },
        onError: (error: Error) => {
            toast.error('Erro ao alterar prioridade: ' + error.message)
        }
    })

    // Bulk Soft Delete
    const bulkDelete = useMutation({
        mutationFn: async ({ cardIds }: BulkDeleteParams) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user.id
                })
                .in('id', cardIds)

            if (error) throw error
            return cardIds.length
        },
        onSuccess: (count) => {
            toast.success(`${count} leads movidos para a lixeira!`)
            invalidateQueries()
        },
        onError: (error: Error) => {
            toast.error('Erro ao excluir leads: ' + error.message)
        }
    })

    return {
        bulkMoveStage: bulkMoveStage.mutateAsync,
        bulkChangeOwner: bulkChangeOwner.mutateAsync,
        bulkChangePriority: bulkChangePriority.mutateAsync,
        bulkDelete: bulkDelete.mutateAsync,
        isMovingStage: bulkMoveStage.isPending,
        isChangingOwner: bulkChangeOwner.isPending,
        isChangingPriority: bulkChangePriority.isPending,
        isDeleting: bulkDelete.isPending,
        isLoading: bulkMoveStage.isPending || bulkChangeOwner.isPending || bulkChangePriority.isPending || bulkDelete.isPending
    }
}
