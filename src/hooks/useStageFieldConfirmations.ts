import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Regras de confirmação visual de campos ao entrar em uma etapa.
 * Admin configura em Pipeline Studio → Stage Inspector → aba "Confirmações".
 * Usado por FieldConfirmationModal para exibir os campos antes da movimentação.
 */
export interface StageFieldConfirmation {
    id: string
    stage_id: string
    field_key: string
    field_label: string | null
    ordem: number
    ativo: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, types não regenerados
const sfcTable = () => supabase.from('stage_field_confirmations' as any)

/**
 * Lê todas as regras de confirmação ativas, globalmente.
 * Retorna um Map<stage_id, confirmations[]> para lookup O(1) durante movimentação.
 */
export function useStageFieldConfirmations() {
    const { data, isLoading } = useQuery({
        queryKey: ['stage-field-confirmations-all'],
        queryFn: async () => {
            const { data, error } = await sfcTable()
                .select('id, stage_id, field_key, field_label, ordem, ativo')
                .eq('ativo', true)
                .order('ordem', { ascending: true })
            if (error) throw error
            return (data as unknown as StageFieldConfirmation[]) || []
        },
        staleTime: 1000 * 60 * 5
    })

    const getForStage = (stageId: string): StageFieldConfirmation[] => {
        if (!data) return []
        return data.filter(c => c.stage_id === stageId)
    }

    const hasConfirmations = (stageId: string): boolean => {
        return getForStage(stageId).length > 0
    }

    return { data, isLoading, getForStage, hasConfirmations }
}

/**
 * Lê as regras de uma etapa específica (usado no painel admin).
 */
export function useStageFieldConfirmationsByStage(stageId: string | null | undefined) {
    return useQuery({
        queryKey: ['stage-field-confirmations', stageId],
        queryFn: async () => {
            if (!stageId) return []
            const { data, error } = await sfcTable()
                .select('id, stage_id, field_key, field_label, ordem, ativo')
                .eq('stage_id', stageId)
                .order('ordem', { ascending: true })
            if (error) throw error
            return (data as unknown as StageFieldConfirmation[]) || []
        },
        enabled: !!stageId,
        staleTime: 1000 * 60 * 5
    })
}

export function useUpsertStageFieldConfirmation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (payload: {
            id?: string
            stage_id: string
            field_key: string
            field_label?: string | null
            ordem?: number
            ativo?: boolean
        }) => {
            const { error } = await sfcTable().upsert(payload, {
                onConflict: 'stage_id,field_key'
            })
            if (error) throw error
        },
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ['stage-field-confirmations', vars.stage_id] })
            qc.invalidateQueries({ queryKey: ['stage-field-confirmations-all'] })
        }
    })
}

export function useDeleteStageFieldConfirmation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id }: { id: string; stage_id: string }) => {
            const { error } = await sfcTable().delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ['stage-field-confirmations', vars.stage_id] })
            qc.invalidateQueries({ queryKey: ['stage-field-confirmations-all'] })
        }
    })
}
