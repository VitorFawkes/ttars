import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface UseEncerrarViagemOptions {
    onSuccess?: () => void
    onError?: (error: Error) => void
}

/**
 * Encerrar viagem (TRIPS) — chama a RPC `encerrar_viagem`, que marca o card como
 * encerrado (sai do funil) e, se há venda real, consolida como ganho. Disponível
 * apenas na última etapa de pós-venda ("Pós-viagem & Reativação"). A validação de
 * escopo/org é feita no banco (SECURITY DEFINER).
 */
export function useEncerrarViagem(options?: UseEncerrarViagemOptions) {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (cardId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('encerrar_viagem', {
                p_card_id: cardId,
            })
            if (error) throw error
            return cardId
        },
        onSuccess: (cardId) => {
            toast.success('Viagem encerrada.')
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
            options?.onSuccess?.()
        },
        onError: (error: Error) => {
            toast.error('Não consegui encerrar a viagem: ' + error.message)
            options?.onError?.(error)
        },
    })

    return {
        encerrarViagem: mutation.mutate,
        isEncerrando: mutation.isPending,
    }
}
