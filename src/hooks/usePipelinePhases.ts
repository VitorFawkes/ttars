import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { PipelinePhase } from '@/types/pipeline'

export function usePipelinePhases(pipelineId?: string, includeInactive = false) {
    return useQuery({
        queryKey: ['pipeline-phases', pipelineId ?? 'all', includeInactive],
        queryFn: async () => {
            if (pipelineId) {
                // Get phases that have at least one stage in this pipeline.
                // Se includeInactive, trazemos também phases de stages inativas (pra Studio mostrar tudo).
                let stagesQuery = supabase
                    .from('pipeline_stages')
                    .select('phase_id')
                    .eq('pipeline_id', pipelineId)
                if (!includeInactive) {
                    stagesQuery = stagesQuery.eq('ativo', true)
                }
                const { data: stagePhaseIds, error: stageErr } = await stagesQuery

                if (stageErr) throw stageErr

                const phaseIds = [...new Set((stagePhaseIds || []).map(s => s.phase_id).filter((id): id is string => !!id))]
                if (phaseIds.length === 0) return []

                let phasesQuery = supabase
                    .from('pipeline_phases')
                    .select('*')
                    .in('id', phaseIds)
                    .order('order_index')
                if (!includeInactive) {
                    phasesQuery = phasesQuery.eq('active', true)
                }
                const { data, error } = await phasesQuery

                if (error) throw error
                return data as PipelinePhase[]
            }

            let query = supabase
                .from('pipeline_phases')
                .select('*')
                .order('order_index')
            if (!includeInactive) {
                query = query.eq('active', true)
            }
            const { data, error } = await query

            if (error) throw error
            return data as PipelinePhase[]
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}
