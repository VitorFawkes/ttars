import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type SubCardCategory = 'addition' | 'change'

interface TransformParams {
    cardId: string
    parentId: string
    category?: SubCardCategory
    descricao?: string | null
}

export interface TransformIntoSubCardResult {
    success: boolean
    sub_card_id: string
    parent_id: string
    mode: 'incremental'
    category: SubCardCategory
    error?: string
}

/** Pega um card existente (standard, sem pai) e amarra como sub-card de outro card em pós-venda. */
export function useTransformIntoSubCard() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ cardId, parentId, category, descricao }: TransformParams): Promise<TransformIntoSubCardResult> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
            const { data, error } = await (supabase.rpc as any)('transformar_em_sub_card', {
                p_card_id: cardId,
                p_parent_id: parentId,
                p_category: category ?? 'change',
                p_descricao: descricao ?? null,
            })
            if (error) throw error
            const result = data as TransformIntoSubCardResult
            if (!result?.success) throw new Error(result?.error || 'Erro ao vincular como sub-card')
            return result
        },
        onSuccess: (result, vars) => {
            queryClient.invalidateQueries({ queryKey: ['card', vars.cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', vars.cardId] })
            queryClient.invalidateQueries({ queryKey: ['card', vars.parentId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', vars.parentId] })
            queryClient.invalidateQueries({ queryKey: ['sub-cards', vars.parentId] })
            queryClient.invalidateQueries({ queryKey: ['sub-card-parent', vars.cardId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            queryClient.invalidateQueries({ queryKey: ['tarefas', vars.parentId] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', vars.parentId] })
            queryClient.invalidateQueries({ queryKey: ['activity-feed', vars.cardId] })
            void result
        },
    })
}
