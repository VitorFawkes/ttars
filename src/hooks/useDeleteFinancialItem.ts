import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export function useDeleteFinancialItem(cardId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (itemId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('arquivar_financial_item', {
                p_item_id: itemId,
            })
            if (error) throw error
            const result = data as { success: boolean; error?: string } | null
            if (result && result.success === false) {
                throw new Error(result.error || 'Falha ao apagar produto')
            }
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['financial-items', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
            toast.success('Produto apagado')
        },
        onError: (err: Error) => {
            toast.error('Erro ao apagar produto: ' + err.message)
        },
    })
}
