import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

export type SubCardMode = 'incremental' | 'complete'
export type SubCardStatus = 'active' | 'merged' | 'cancelled'
export type MergeMode = 'replace' | 'append'

export interface MergeGroupConfig {
    copiar_pai: boolean
    merge_mode: MergeMode
}

export interface MergeConfig {
    texto: MergeGroupConfig
    viagem: MergeGroupConfig
}

export const DEFAULT_MERGE_CONFIG: Record<SubCardMode, MergeConfig> = {
    incremental: {
        texto: { copiar_pai: false, merge_mode: 'append' },
        viagem: { copiar_pai: false, merge_mode: 'append' }
    },
    complete: {
        texto: { copiar_pai: true, merge_mode: 'replace' },
        viagem: { copiar_pai: true, merge_mode: 'replace' }
    }
}

export interface SubCard {
    id: string
    titulo: string
    sub_card_mode: SubCardMode
    sub_card_status: SubCardStatus
    valor_estimado: number | null
    valor_final: number | null
    status_comercial: string
    ganho_planner: boolean
    is_planner_won: boolean
    etapa_nome: string
    fase: string
    merged_at: string | null
    merge_metadata: {
        old_parent_value?: number
        sub_card_value?: number
        new_parent_value?: number
        mode?: SubCardMode
        merge_config?: MergeConfig
        cancelled_reason?: string
    } | null
    merge_config: MergeConfig | null
    created_at: string
    dono_nome: string | null
}

interface CreateSubCardParams {
    parentId: string
    titulo: string
    descricao: string
    mode: SubCardMode
    mergeConfig?: MergeConfig
}

interface MergeSubCardResult {
    success: boolean
    error?: string
    parent_id?: string
    old_value?: number
    new_value?: number
    mode?: SubCardMode
    proposal_id?: string
    merge_config?: MergeConfig
}

interface MergeSubCardParams {
    subCardId: string
    mergeConfigOverride?: MergeConfig
}

interface CancelSubCardResult {
    success: boolean
    error?: string
    sub_card_id?: string
    parent_id?: string
}

/**
 * Hook for managing sub-cards (change requests)
 *
 * Features:
 * - Create sub-cards from parent cards in Pós-venda
 * - List sub-cards for a parent
 * - Merge completed sub-cards back to parent
 * - Cancel sub-cards
 */
export function useSubCards(parentCardId?: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

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
        mutationFn: async ({ parentId, titulo, descricao, mode, mergeConfig }: CreateSubCardParams) => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('criar_sub_card', {
                    p_parent_id: parentId,
                    p_titulo: titulo,
                    p_descricao: descricao,
                    p_mode: mode,
                    p_merge_config: mergeConfig || null
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
        onSuccess: (data, variables) => {
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ['sub-cards', variables.parentId] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card', variables.parentId] })
            queryClient.invalidateQueries({ queryKey: ['tarefas', variables.parentId] })

            toast({
                type: 'success',
                title: 'Card de alteração criado',
                description: data.mode === 'incremental'
                    ? 'O valor será somado ao card principal após o merge'
                    : 'O valor substituirá o card principal após o merge'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao criar card de alteração',
                description: error.message
            })
        }
    })

    // Mutation: Merge sub-card
    const mergeSubCardMutation = useMutation({
        mutationFn: async ({ subCardId, mergeConfigOverride }: MergeSubCardParams) => {
            const options = mergeConfigOverride
                ? { merge_config: mergeConfigOverride }
                : {};
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs pendentes de regeneracao de types
            await (supabase as any)
                .rpc('merge_sub_card', {
                    p_sub_card_id: subCardId,
                    p_options: options
                })

            if (error) throw error

            const result = data as MergeSubCardResult

            if (!result.success) {
                throw new Error(result.error || 'Erro ao fazer merge do card de alteração')
            }

            return result
        },
        onSuccess: (data) => {
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ['sub-cards'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card'] })
            queryClient.invalidateQueries({ queryKey: ['tarefas'] })
            queryClient.invalidateQueries({ queryKey: ['atividades'] })

            const modeText = data.mode === 'incremental'
                ? `Valor somado: ${formatCurrency(data.old_value || 0)} + ${formatCurrency((data.new_value || 0) - (data.old_value || 0))} = ${formatCurrency(data.new_value || 0)}`
                : `Novo valor: ${formatCurrency(data.new_value || 0)}`

            toast({
                type: 'success',
                title: 'Alteração concluída',
                description: modeText
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao concluir alteração',
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
                title: 'Alteração cancelada',
                description: 'O card de alteração foi cancelado'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao cancelar alteração',
                description: error.message
            })
        }
    })

    // Helper: Check if card can have sub-cards created
    const canCreateSubCard = (card: {
        card_type?: string | null
        fase?: string | null
        is_group_parent?: boolean | null
    }) => {
        // Must be in Pós-venda phase
        if (card.fase !== 'Pós-venda') return false
        // Cannot be a sub-card itself
        if (card.card_type === 'sub_card') return false
        // Cannot be a group parent (for now)
        if (card.is_group_parent) return false

        return true
    }

    // Helper: Get active sub-cards count
    const getActiveSubCardsCount = () => {
        if (!subCardsQuery.data) return 0
        return subCardsQuery.data.filter(sc => sc.sub_card_status === 'active').length
    }

    // Helper: Check if sub-card can be merged (ganho Planner, not ganho total)
    const canMergeSubCard = (subCard: SubCard) => {
        return subCard.sub_card_status === 'active' && subCard.ganho_planner === true && subCard.is_planner_won === true
    }

    return {
        // Query
        subCards: subCardsQuery.data || [],
        isLoading: subCardsQuery.isLoading,
        error: subCardsQuery.error,

        // Mutations
        createSubCard: createSubCardMutation.mutate,
        isCreating: createSubCardMutation.isPending,

        mergeSubCard: mergeSubCardMutation.mutate,
        isMerging: mergeSubCardMutation.isPending,

        cancelSubCard: cancelSubCardMutation.mutate,
        isCancelling: cancelSubCardMutation.isPending,

        // Helpers
        canCreateSubCard,
        canMergeSubCard,
        getActiveSubCardsCount,

        // Refetch
        refetch: subCardsQuery.refetch
    }
}

// Utility function
function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value)
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

    return {
        isSubCard,
        subCardMode,
        parentCard,
        isLoading: query.isLoading,
        error: query.error
    }
}
