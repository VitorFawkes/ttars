import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PipelineStage } from '@/types/pipeline'

export function usePipelineStages(pipelineId?: string) {
    return useQuery({
        queryKey: ['pipeline-stages', pipelineId ?? 'all'],
        queryFn: async () => {
            let query = supabase
                .from('pipeline_stages')
                .select('*, pipeline_phases!pipeline_stages_phase_id_fkey(order_index)')
                .order('ordem')
            if (pipelineId) {
                query = query.eq('pipeline_id', pipelineId)
            }
            const { data, error } = await query

            if (error) throw error

            // Sort by phase order_index first, then by stage ordem within phase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sorted = (data || []).sort((a: any, b: any) => {
                const phaseA = a.pipeline_phases?.order_index ?? 999
                const phaseB = b.pipeline_phases?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            })

            return sorted as unknown as PipelineStage[]
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}
