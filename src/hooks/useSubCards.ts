import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useCardRulesSettings } from './useCardRulesSettings'

export type SubCardMode = 'incremental'
export type SubCardStatus = 'active' | 'merged' | 'cancelled' | 'completed'
export type SubCardCategory = 'addition' | 'change'

export interface SubCard {
    id: string
    titulo: string
    sub_card_mode: SubCardMode
    sub_card_status: SubCardStatus
    sub_card_category: SubCardCategory
    valor_estimado: number | null
    valor_final: number | null
    status_comercial: string
    ganho_planner: boolean
    etapa_nome: string
    fase: string
    created_at: string
    dono_nome: string | null
    // V2 fields
    progress_percent: number
    phase_slug: string | null
    financial_items_count: number
    financial_items_ready: number
    data_fechamento: string | null
    sub_card_agregado_em: string | null
}

interface CreateSubCardParams {
    parentId: string
    titulo: string
    descricao: string
    category?: SubCardCategory
    valorEstimado?: number
}

interface CancelSubCardResult {
    success: boolean
    error?: string
    sub_card_id?: string
    parent_id?: string
}

/**
 * Hook for managing sub-cards (novas vendas/mudanças que precisam de planejamento)
 *
 * Features:
 * - Create sub-cards from parent cards (apenas em Pós-venda)
 * - List sub-cards for a parent with progress info
 * - Cancel sub-cards
 * - Value aggregates automatically when sub-card enters Pós-venda
 */
export function useSubCards(parentCardId?: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { subcardRequiresPosVenda: requiresPosVenda } = useCardRulesSettings()

    // Query: Get sub-cards for a parent card
    const subCardsQuery = useQuery({
        queryKey: ['sub-cards', parentCardId],
        enabled: !!parentCardId,
        queryFn: async () => {
            if (!parentCardId) return []

            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('get_sub_cards', { p_parent_id: parentCardId })

            if (error) throw error
            return (data as SubCard[]) || []
        }
    })

    // Mutation: Create sub-card
    const createSubCardMutation = useMutation({
        mutationFn: async ({ parentId, titulo, descricao, category, valorEstimado }: CreateSubCardParams) => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('criar_sub_card', {
                    p_parent_id: parentId,
                    p_titulo: titulo,
                    p_descricao: descricao,
                    p_category: category || 'addition',
                    p_valor_estimado: valorEstimado || 0
                })

            if (error) throw error

            const result = data as {
                success: boolean
                error?: string
                sub_card_id?: string
                task_id?: string
                mode?: SubCardMode
                parent_id?: string
            }

            if (!result.success) {
                throw new Error(result.error || 'Erro ao criar card de alteração')
            }

            return result
        },
        onSuccess: (_, variables) => {
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ['sub-cards', variables.parentId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card', variables.parentId] })
            queryClient.invalidateQueries({ queryKey: ['tarefas', variables.parentId] })

            toast({
                type: 'success',
                title: 'Sub-card criado',
                description: 'O valor será agregado ao card principal quando entrar em Pós-venda'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao criar sub-card',
                description: error.message
            })
        }
    })

    // Mutation: Complete sub-card (manual — Planner or Pós-venda decides when done)
    const completeSubCardMutation = useMutation({
        mutationFn: async (subCardId: string) => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('completar_sub_card', { p_sub_card_id: subCardId })

            if (error) throw error

            const result = data as { success: boolean; error?: string; sub_card_id?: string; parent_id?: string }
            if (!result.success) throw new Error(result.error || 'Erro ao concluir sub-card')
            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sub-cards'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card'] })

            toast({
                type: 'success',
                title: 'Sub-card concluído',
                description: 'O sub-card foi marcado como concluído'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao concluir sub-card',
                description: error.message
            })
        }
    })

    // Mutation: Cancel sub-card
    const cancelSubCardMutation = useMutation({
        mutationFn: async ({ subCardId, motivo }: { subCardId: string; motivo?: string }) => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('cancelar_sub_card', {
                    p_sub_card_id: subCardId,
                    p_motivo: motivo || null
                })

            if (error) throw error

            const result = data as CancelSubCardResult

            if (!result.success) {
                throw new Error(result.error || 'Erro ao cancelar card de alteração')
            }

            return result
        },
        onSuccess: () => {
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ['sub-cards'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card'] })
            queryClient.invalidateQueries({ queryKey: ['tarefas'] })

            toast({
                type: 'success',
                title: 'Sub-card cancelado',
                description: 'O sub-card foi cancelado'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao cancelar sub-card',
                description: error.message
            })
        }
    })

    // Helper: Check if card can have sub-cards created
    const canCreateSubCard = (card: {
        card_type?: string | null
        is_group_parent?: boolean | null
        phase_slug?: string | null
    }) => {
        // Cannot be a sub-card itself
        if (card.card_type === 'sub_card') return false
        // Cannot be a future opportunity
        if (card.card_type === 'future_opportunity') return false
        // Cannot be a group parent
        if (card.is_group_parent) return false
        // Regra Pós-venda (configurável por workspace via organizations.settings)
        if (requiresPosVenda && card.phase_slug !== undefined && card.phase_slug !== 'pos_venda') return false
        return true
    }

    // Helper: Get active sub-cards count
    const getActiveSubCardsCount = () => {
        if (!subCardsQuery.data) return 0
        return subCardsQuery.data.filter(sc => sc.sub_card_status === 'active').length
    }

    return {
        // Query
        subCards: subCardsQuery.data || [],
        isLoading: subCardsQuery.isLoading,
        error: subCardsQuery.error,

        // Mutations
        createSubCard: createSubCardMutation.mutate,
        isCreating: createSubCardMutation.isPending,

        completeSubCard: completeSubCardMutation.mutate,
        isCompleting: completeSubCardMutation.isPending,

        cancelSubCard: cancelSubCardMutation.mutate,
        isCancelling: cancelSubCardMutation.isPending,

        // Helpers
        canCreateSubCard,
        getActiveSubCardsCount,

        // Refetch
        refetch: subCardsQuery.refetch
    }
}

/**
 * Hook to check if current card is a sub-card and get parent info
 */
export function useSubCardParent(cardId?: string) {
    const query = useQuery({
        queryKey: ['sub-card-parent', cardId],
        enabled: !!cardId,
        queryFn: async () => {
            if (!cardId) return null

            // Get the card with its parent info
            // Cast to any until types are regenerated
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .from('cards')
                .select(`
                    id,
                    card_type,
                    sub_card_mode,
                    sub_card_status,
                    parent_card_id,
                    parent:parent_card_id (
                        id,
                        titulo,
                        valor_estimado,
                        valor_final
                    )
                `)
                .eq('id', cardId)
                .single()

            if (error) throw error
            return data as {
                id: string
                card_type: string | null
                sub_card_mode: string | null
                sub_card_status: string | null
                parent_card_id: string | null
                parent: {
                    id: string
                    titulo: string
                    valor_estimado: number | null
                    valor_final: number | null
                } | null
            } | null
        }
    })

    const isSubCard = query.data?.card_type === 'sub_card'
    const subCardMode = query.data?.sub_card_mode as SubCardMode | null
    const parentCard = query.data?.parent as {
        id: string
        titulo: string
        valor_estimado: number | null
        valor_final: number | null
    } | null

    const subCardStatus = query.data?.sub_card_status as SubCardStatus | null

    return {
        isSubCard,
        subCardMode,
        subCardStatus,
        parentCard,
        isLoading: query.isLoading,
        error: query.error
    }
}
