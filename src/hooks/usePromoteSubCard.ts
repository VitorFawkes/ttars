import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface PromoteSubCardResult {
    success: boolean
    card_id: string
    former_parent_id: string | null
    titulo: string | null
}

/** Transforma sub-card em card principal (standard). Dispara invalidações nas queries relevantes. */
export function usePromoteSubCard() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (subCardId: string): Promise<PromoteSubCardResult> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
            const { data, error } = await (supabase.rpc as any)('converter_sub_card_em_principal', {
                p_sub_card_id: subCardId,
            })
            if (error) throw error
            return data as PromoteSubCardResult
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['card-detail', result.card_id] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            if (result.former_parent_id) {
                queryClient.invalidateQueries({ queryKey: ['card-detail', result.former_parent_id] })
                queryClient.invalidateQueries({ queryKey: ['sub-cards', result.former_parent_id] })
            }
        },
    })
}
