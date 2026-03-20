import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface CardCreationRule {
    id: string
    team_id: string
    stage_id: string
    created_by: string | null
    created_at: string
    teams?: { id: string; name: string }
    pipeline_stages?: { id: string; nome: string; ordem: number }
}

interface AllowedStage {
    id: string
    nome: string
    ordem: number
    fase: string | null
    phase_id: string | null
}

/**
 * Hook for admin management of card creation rules
 */
export function useCardCreationRules() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    const { data: rules = [], isLoading, error } = useQuery({
        queryKey: ['card-creation-rules'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_creation_rules')
                .select(`
          id,
          team_id,
          stage_id,
          created_by,
          created_at,
          teams(id, name),
          pipeline_stages(id, nome, ordem)
        `)
                .order('created_at')

            if (error) throw error
            return data as CardCreationRule[]
        }
    })

    const addRule = useMutation({
        mutationFn: async ({ teamId, stageId }: { teamId: string; stageId: string }) => {
            const { data, error } = await supabase
                .from('card_creation_rules')
                .insert({
                    team_id: teamId,
                    stage_id: stageId,
                    created_by: profile?.id
                })
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-creation-rules'] })
            queryClient.invalidateQueries({ queryKey: ['allowed-stages'] })
        }
    })

    const removeRule = useMutation({
        mutationFn: async ({ teamId, stageId }: { teamId: string; stageId: string }) => {
            const { error } = await supabase
                .from('card_creation_rules')
                .delete()
                .eq('team_id', teamId)
                .eq('stage_id', stageId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-creation-rules'] })
            queryClient.invalidateQueries({ queryKey: ['allowed-stages'] })
        }
    })

    const toggleRule = useMutation({
        mutationFn: async ({ teamId, stageId, isAllowed }: { teamId: string; stageId: string; isAllowed: boolean }) => {
            if (isAllowed) {
                return addRule.mutateAsync({ teamId, stageId })
            } else {
                return removeRule.mutateAsync({ teamId, stageId })
            }
        }
    })

    return {
        rules,
        isLoading,
        error,
        addRule,
        removeRule,
        toggleRule
    }
}

/**
 * Hook to get all stages for the product, sorted by phase order then stage order.
 * All users see all stages — the UI handles prioritizing the user's phase.
 */
export function useAllowedStages(product: string) {
    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    const { data: allowedStages = [], isLoading } = useQuery({
        queryKey: ['allowed-stages', product],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select(`
                    id, nome, ordem, fase, phase_id,
                    pipeline_phases!pipeline_stages_phase_id_fkey(id, name, order_index),
                    pipelines!pipeline_stages_pipeline_id_fkey!inner(produto)
                `)
                .eq('ativo', true)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested filter typing
                .eq('pipelines.produto', product as any)

            if (error) throw error

            return (data || [])
                .sort((a, b) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                    const pa = (a.pipeline_phases as any)?.order_index ?? 999
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                    const pb = (b.pipeline_phases as any)?.order_index ?? 999
                    return pa !== pb ? pa - pb : a.ordem - b.ordem
                })
                .map(s => ({ id: s.id, nome: s.nome, ordem: s.ordem, fase: s.fase, phase_id: s.phase_id })) as AllowedStage[]
        },
        enabled: !!profile
    })

    return {
        allowedStages,
        isLoading,
        isAdmin,
        hasTeam: !!profile?.team_id
    }
}
