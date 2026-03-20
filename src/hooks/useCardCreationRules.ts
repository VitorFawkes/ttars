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
 * Hook to get allowed stages for the current user based on their team
 * Returns all stages if user has no team or is admin
 */
export function useAllowedStages(product: string) {
    const { profile } = useAuth()
    const teamId = profile?.team_id
    const isAdmin = profile?.is_admin === true

    const { data: allowedStages = [], isLoading } = useQuery({
        queryKey: ['allowed-stages', teamId, isAdmin, product],
        queryFn: async () => {
            // If user is admin or has no team, return all stages for the product
            if (isAdmin || !teamId) {
                // Get stages with their phase info, ordered by phase then stage order
                // Filter by product via pipeline relationship
                const { data, error } = await supabase
                    .from('pipeline_stages')
                    .select(`
                        id,
                        nome,
                        ordem,
                        fase,
                        phase_id,
                        pipeline_phases!pipeline_stages_phase_id_fkey(id, name, order_index),
                        pipelines!pipeline_stages_pipeline_id_fkey!inner(produto)
                    `)
                    .eq('ativo', true)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested filter typing
                    .eq('pipelines.produto', product as any)

                if (error) throw error

                // Sort by phase order_index, then by stage ordem within phase
                const sorted = (data || []).sort((a, b) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                    const phaseOrderA = (a.pipeline_phases as any)?.order_index ?? 999
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                    const phaseOrderB = (b.pipeline_phases as any)?.order_index ?? 999
                    if (phaseOrderA !== phaseOrderB) return phaseOrderA - phaseOrderB
                    return a.ordem - b.ordem
                })

                return sorted.map(s => ({
                    id: s.id,
                    nome: s.nome,
                    ordem: s.ordem,
                    fase: s.fase // This is the phase name as text
                })) as AllowedStage[]
            }

            // Otherwise, return only stages allowed for their team
            const { data, error } = await supabase
                .from('card_creation_rules')
                .select(`
                    stage_id,
                    pipeline_stages!inner(
                        id,
                        nome,
                        ordem,
                        fase,
                        phase_id,
                        pipeline_phases!pipeline_stages_phase_id_fkey(order_index),
                        pipelines!pipeline_stages_pipeline_id_fkey!inner(produto)
                    )
                `)
                .eq('team_id', teamId)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested filter typing
                .eq('pipeline_stages.pipelines.produto', product as any)

            if (error) throw error

            // Extract the stage data - filter out nulls and map to AllowedStage
            // Sort by phase order_index first, then by stage ordem within phase
            const stages = (data || [])
                .map(rule => rule.pipeline_stages)
                .filter(stage => stage !== null)
                .map(stage => ({
                    id: stage!.id,
                    nome: stage!.nome,
                    ordem: stage!.ordem,
                    fase: stage!.fase,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                    _phaseOrder: (stage as any)?.pipeline_phases?.order_index ?? 999
                }))
                .sort((a, b) => a._phaseOrder !== b._phaseOrder ? a._phaseOrder - b._phaseOrder : a.ordem - b.ordem)
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                .map(({ _phaseOrder: _order, ...rest }) => rest)

            // Fallback: time sem regras configuradas → mostrar todas as etapas
            if (stages.length === 0) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from('pipeline_stages')
                    .select(`
                        id, nome, ordem, fase, phase_id,
                        pipeline_phases!pipeline_stages_phase_id_fkey(id, name, order_index),
                        pipelines!pipeline_stages_pipeline_id_fkey!inner(produto)
                    `)
                    .eq('ativo', true)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested filter typing
                    .eq('pipelines.produto', product as any)

                if (fallbackError) throw fallbackError

                return (fallbackData || [])
                    .sort((a, b) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                        const pa = (a.pipeline_phases as any)?.order_index ?? 999
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join typing
                        const pb = (b.pipeline_phases as any)?.order_index ?? 999
                        return pa !== pb ? pa - pb : a.ordem - b.ordem
                    })
                    .map(s => ({ id: s.id, nome: s.nome, ordem: s.ordem, fase: s.fase })) as AllowedStage[]
            }

            return stages as AllowedStage[]
        },
        enabled: !!profile
    })

    return {
        allowedStages,
        isLoading,
        isAdmin,
        hasTeam: !!teamId
    }
}
