import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface UseDeleteContactOptions {
    onSuccess?: () => void
    onError?: (error: Error) => void
}

export function useDeleteContact(options?: UseDeleteContactOptions) {
    const queryClient = useQueryClient()

    const invalidateContactQueries = () => {
        queryClient.invalidateQueries({ queryKey: ['contacts-search'] })
        queryClient.invalidateQueries({ queryKey: ['deleted-contacts'] })
        queryClient.invalidateQueries({ queryKey: ['person-trips'] })
        queryClient.invalidateQueries({ queryKey: ['global-search'] })
    }

    const softDeleteMutation = useMutation({
        mutationFn: async (contactId: string) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('contatos') as any)
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user.id
                })
                .eq('id', contactId)

            if (error) throw error
            return contactId
        },
        onSuccess: () => {
            toast.success('Contato excluído com sucesso')
            invalidateContactQueries()
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao excluir contato: ' + error.message)
            options?.onError?.(error)
        }
    })

    const restoreMutation = useMutation({
        mutationFn: async (contactId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('contatos') as any)
                .update({
                    deleted_at: null,
                    deleted_by: null
                })
                .eq('id', contactId)

            if (error) throw error
            return contactId
        },
        onSuccess: () => {
            toast.success('Contato restaurado com sucesso')
            invalidateContactQueries()
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Erro ao restaurar contato: ' + error.message)
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
