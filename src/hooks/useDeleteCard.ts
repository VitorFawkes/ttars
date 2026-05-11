import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface UseDeleteCardOptions {
    onSuccess?: () => void
    onError?: (error: Error) => void
}

export function useDeleteCard(options?: UseDeleteCardOptions) {
    const queryClient = useQueryClient()

    const invalidateCardQueries = (cardId: string) => {
        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['deleted-cards'] })
    }

    const softDeleteMutation = useMutation({
        mutationFn: async (cardId: string) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user.id
                })
                .eq('id', cardId)

            if (error) throw error
            return cardId
        },
        onSuccess: (cardId) => {
            toast.success('Viagem arquivada com sucesso')
            invalidateCardQueries(cardId)
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao arquivar viagem: ' + error.message)
            options?.onError?.(error)
        }
    })

    const restoreMutation = useMutation({
        mutationFn: async (cardId: string) => {
            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    deleted_at: null,
                    deleted_by: null
                })
                .eq('id', cardId)

            if (error) throw error
            return cardId
        },
        onSuccess: (cardId) => {
            toast.success('Viagem restaurada com sucesso')
            invalidateCardQueries(cardId)
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao restaurar viagem: ' + error.message)
            options?.onError?.(error)
        }
    })

    return {
        softDelete: softDeleteMutation.mutate,
        restore: restoreMutation.mutate,
        isDeleting: softDeleteMutation.isPending,
        isRestoring: restoreMutation.isPending
    }
}
