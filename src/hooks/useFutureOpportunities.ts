import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'

export interface FutureOpportunity {
    id: string
    source_card_id: string
    source_type: 'lost_future' | 'won_upsell'
    scheduled_date: string
    titulo: string
    descricao: string | null
    sub_card_mode: 'incremental' | 'complete' | null
    status: 'pending' | 'executed' | 'cancelled'
    created_card_id: string | null
    executed_at: string | null
    cancelled_at: string | null
    created_at: string
}

interface CreateFutureOpportunityParams {
    sourceCardId: string
    sourceType: 'lost_future' | 'won_upsell'
    titulo: string
    descricao?: string
    scheduledDate: string
    subCardMode?: 'incremental' | 'complete'
    produto?: string | null
    pipelineId?: string | null
    responsavelId?: string | null
    pessoaPrincipalId?: string | null
}

/**
 * Hook for managing future opportunities (scheduled card/sub-card creation)
 */
export function useFutureOpportunities(cardId?: string) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    // Query: list future opportunities for a card
    const query = useQuery({
        queryKey: ['future-opportunities', cardId],
        enabled: !!cardId,
        queryFn: async () => {
            if (!cardId) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela pendente de regeneração de types
            const { data, error } = await (supabase as any)
                .from('future_opportunities')
                .select('*')
                .eq('source_card_id', cardId)
                .order('scheduled_date', { ascending: true })

            if (error) throw error
            return (data as FutureOpportunity[]) || []
        }
    })

    // Mutation: create future opportunity
    const createMutation = useMutation({
        mutationFn: async (params: CreateFutureOpportunityParams) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela pendente de regeneração de types
            const { data, error } = await (supabase as any)
                .from('future_opportunities')
                .insert({
                    source_card_id: params.sourceCardId,
                    source_type: params.sourceType,
                    titulo: params.titulo,
                    descricao: params.descricao || null,
                    scheduled_date: params.scheduledDate,
                    sub_card_mode: params.subCardMode || 'incremental',
                    produto: params.produto || null,
                    pipeline_id: params.pipelineId || null,
                    responsavel_id: params.responsavelId || null,
                    pessoa_principal_id: params.pessoaPrincipalId || null,
                })
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['future-opportunities', variables.sourceCardId] })
            toast({
                type: 'success',
                title: 'Oportunidade futura agendada',
                description: `Card será criado automaticamente em ${formatDate(variables.scheduledDate)}`
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao agendar oportunidade',
                description: error.message
            })
        }
    })

    // Mutation: cancel future opportunity
    const cancelMutation = useMutation({
        mutationFn: async (opportunityId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela pendente de regeneração de types
            const { error } = await (supabase as any)
                .from('future_opportunities')
                .update({
                    status: 'cancelled',
                    cancelled_at: new Date().toISOString()
                })
                .eq('id', opportunityId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['future-opportunities', cardId] })
            toast({
                type: 'success',
                title: 'Agendamento cancelado',
                description: 'A oportunidade futura foi cancelada'
            })
        },
        onError: (error: Error) => {
            toast({
                type: 'error',
                title: 'Erro ao cancelar',
                description: error.message
            })
        }
    })

    const pending = query.data?.filter(o => o.status === 'pending') || []
    const executed = query.data?.filter(o => o.status === 'executed') || []
    const cancelled = query.data?.filter(o => o.status === 'cancelled') || []

    return {
        opportunities: query.data || [],
        pending,
        executed,
        cancelled,
        isLoading: query.isLoading,
        error: query.error,

        create: createMutation.mutate,
        isCreating: createMutation.isPending,

        cancel: cancelMutation.mutate,
        isCancelling: cancelMutation.isPending,

        refetch: query.refetch
    }
}

function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
}
