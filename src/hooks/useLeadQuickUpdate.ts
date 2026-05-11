import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'

interface QuickUpdateParams {
    cardId: string
    field: string
    value: string | number | boolean | null
}

export function useLeadQuickUpdate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ cardId, field, value }: QuickUpdateParams) => {
            const { error } = await supabase
                .from('cards')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', cardId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            toast.success('Lead atualizado')
        },
        onError: (error) => {
            console.error('Error updating lead:', error)
            toast.error('Erro ao atualizar lead')
        }
    })
}

export function useLeadBulkQuickUpdate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ cardIds, field, value }: { cardIds: string[], field: string, value: string | number | boolean | null }) => {
            const { error } = await supabase
                .from('cards')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .in('id', cardIds)

            if (error) throw error
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            toast.success(`${variables.cardIds.length} leads atualizados`)
        },
        onError: (error) => {
            console.error('Error updating leads:', error)
            toast.error('Erro ao atualizar leads')
        }
    })
}
