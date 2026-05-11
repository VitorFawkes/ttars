import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type DataOverdueSeverity = 'warn_only' | 'block_move' | 'block_all'

export interface PipelineGovernanceSettings {
    pipeline_id: string
    org_id: string
    data_overdue_severity: DataOverdueSeverity
    created_at?: string
    updated_at?: string
}

/**
 * Lê configurações de governança de um pipeline (severidade do bloqueio quando
 * Data Prevista de Fechamento está no passado).
 *
 * Default = 'block_all' se a linha ainda não existe (a tabela é populada via
 * seed em migrations + trigger auto-seed em pipelines TRIPS novas).
 */
export function usePipelineGovernance(pipelineId?: string | null) {
    return useQuery({
        queryKey: ['pipeline-governance', pipelineId],
        queryFn: async (): Promise<PipelineGovernanceSettings | null> => {
            if (!pipelineId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await ((supabase.from as any)('pipeline_governance_settings'))
                .select('pipeline_id, org_id, data_overdue_severity, created_at, updated_at')
                .eq('pipeline_id', pipelineId)
                .maybeSingle()
            if (error) throw error
            return data as PipelineGovernanceSettings | null
        },
        enabled: !!pipelineId,
        staleTime: 1000 * 60 * 5,
    })
}

/**
 * Mutation para atualizar a severidade do bloqueio de data atrasada.
 * Apenas admins têm permissão (RLS já filtra por org).
 */
export function useUpdatePipelineGovernanceSeverity() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (params: {
            pipelineId: string
            orgId: string
            severity: DataOverdueSeverity
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await ((supabase.from as any)('pipeline_governance_settings'))
                .upsert({
                    pipeline_id: params.pipelineId,
                    org_id: params.orgId,
                    data_overdue_severity: params.severity,
                }, { onConflict: 'pipeline_id' })
            if (error) throw error
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-governance', variables.pipelineId] })
        },
    })
}

/**
 * Helper: dado o `produto_data` de um card, retorna a Data Prevista de
 * Fechamento como objeto Date (ou null).
 */
export function getDataPrevistaFechamento(produtoData: unknown): Date | null {
    if (!produtoData || typeof produtoData !== 'object') return null
    const raw = (produtoData as Record<string, unknown>).data_prevista_fechamento
    if (typeof raw !== 'string' || raw === '') return null
    // Normaliza ISO date pra Date sem timezone shift
    const [y, m, d] = raw.split('T')[0].split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
}

/**
 * Helper: retorna número de dias que a Data Prevista está no passado
 * (positivo = atrasado, 0 = hoje, null = não preenchida/futuro).
 */
export function getDiasAtrasoDataPrevista(produtoData: unknown): number | null {
    const data = getDataPrevistaFechamento(produtoData)
    if (!data) return null
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const diffMs = hoje.getTime() - data.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : null
}
