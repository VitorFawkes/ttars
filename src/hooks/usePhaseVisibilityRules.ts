import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface PhaseVisibilityRule {
    id: string
    source_phase_id: string
    target_phase_id: string
    created_at: string
}

// Tabela nova — ainda não está em database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from('phase_visibility_rules')

export function usePhaseVisibilityRules() {
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: ['phase-visibility-rules'],
        queryFn: async () => {
            const { data, error } = await table().select('*')
            if (error) throw error
            return (data || []) as PhaseVisibilityRule[]
        },
        staleTime: 10 * 60 * 1000
    })

    const addRule = useMutation({
        mutationFn: async ({ sourcePhaseId, targetPhaseId }: { sourcePhaseId: string; targetPhaseId: string }) => {
            const { error } = await table()
                .insert({ source_phase_id: sourcePhaseId, target_phase_id: targetPhaseId })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['phase-visibility-rules'] })
            queryClient.invalidateQueries({ queryKey: ['my-visible-phases'] })
        }
    })

    const removeRule = useMutation({
        mutationFn: async ({ sourcePhaseId, targetPhaseId }: { sourcePhaseId: string; targetPhaseId: string }) => {
            const { error } = await table()
                .delete()
                .eq('source_phase_id', sourcePhaseId)
                .eq('target_phase_id', targetPhaseId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['phase-visibility-rules'] })
            queryClient.invalidateQueries({ queryKey: ['my-visible-phases'] })
        }
    })

    return { rules: query.data || [], isLoading: query.isLoading, addRule, removeRule }
}
