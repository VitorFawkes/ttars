import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface DuplicateParams {
    sourceId: string
    novoTitulo: string
}

export interface DuplicateCardResult {
    success: boolean
    new_card_id: string
    new_card_titulo: string
    source_card_id: string
    error?: string
}

/** Duplica um card como template para outro cliente — copia destinos/itens/tags, zera cliente/tarefas/propostas. */
export function useDuplicateCard() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    return useMutation({
        mutationFn: async ({ sourceId, novoTitulo }: DuplicateParams): Promise<DuplicateCardResult> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
            const { data, error } = await (supabase.rpc as any)('duplicar_card_template', {
                p_source_id: sourceId,
                p_titulo_novo: novoTitulo,
                p_dono_atual_id: profile?.id ?? null,
            })
            if (error) throw error
            const result = data as DuplicateCardResult
            if (!result?.success) throw new Error(result?.error || 'Erro ao duplicar card')
            return result
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', result.source_card_id] })
        },
    })
}
