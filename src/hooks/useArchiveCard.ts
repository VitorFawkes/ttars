import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface UseArchiveCardOptions {
    onSuccess?: () => void
    onError?: (error: Error) => void
}

export function useArchiveCard(options?: UseArchiveCardOptions) {
    const queryClient = useQueryClient()

    const invalidateCardQueries = (cardId: string) => {
        queryClient.invalidateQueries({ queryKey: ['cards'] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['archived-cards'] })
    }

    const archiveMutation = useMutation({
        mutationFn: async (cardId: string) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    archived_at: new Date().toISOString(),
                    archived_by: user.id
                })
                .eq('id', cardId)

            if (error) throw error
            return cardId
        },
        onSuccess: (cardId) => {
            toast.success('Card arquivado com sucesso')
            invalidateCardQueries(cardId)
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao arquivar card: ' + error.message)
            options?.onError?.(error)
        }
    })

    const unarchiveMutation = useMutation({
        mutationFn: async (cardId: string) => {
            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    archived_at: null,
                    archived_by: null
                })
                .eq('id', cardId)

            if (error) throw error
            return cardId
        },
        onSuccess: (cardId) => {
            toast.success('Card desarquivado com sucesso')
            invalidateCardQueries(cardId)
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao desarquivar card: ' + error.message)
            options?.onError?.(error)
        }
    })

    const archiveBulkMutation = useMutation({
        mutationFn: async (cardIds: string[]) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const { error } = await (supabase
                .from('cards') as any)
                .update({
                    archived_at: new Date().toISOString(),
                    archived_by: user.id
                })
                .in('id', cardIds)

            if (error) throw error
            return cardIds
        },
        onSuccess: (cardIds) => {
            toast.success(`${cardIds.length} cards arquivados com sucesso`)
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['archived-cards'] })
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao arquivar cards: ' + error.message)
            options?.onError?.(error)
        }
    })

    return {
        archive: archiveMutation.mutate,
        unarchive: unarchiveMutation.mutate,
        archiveBulk: archiveBulkMutation.mutate,
        isArchiving: archiveMutation.isPending || archiveBulkMutation.isPending,
        isUnarchiving: unarchiveMutation.isPending
    }
}
