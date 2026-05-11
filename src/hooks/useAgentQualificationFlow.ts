import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DisqualificationTrigger {
  trigger: string
  message: string
}

export interface QualificationStage {
  id: string
  agent_id: string
  stage_order: number
  stage_name: string
  stage_key: string | null
  question: string
  subquestions: string[]
  disqualification_triggers: DisqualificationTrigger[]
  advance_to_stage_id: string | null
  advance_condition: string | null
  response_options: string[] | null
  maps_to_field: string | null
  skip_if_filled: boolean
  created_at: string
}

export type QualificationStageInput = Omit<QualificationStage, 'id' | 'agent_id' | 'created_at'>

const keyForAgent = (agentId?: string) => ['agent-qualification-flow', agentId ?? 'none']

export function useAgentQualificationFlow(agentId?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keyForAgent(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_qualification_flow')
        .select('*')
        .eq('agent_id', agentId)
        .order('stage_order', { ascending: true })
      if (error) throw error
      return (data || []) as QualificationStage[]
    },
  })

  const replaceAll = useMutation({
    mutationFn: async (stages: QualificationStageInput[]) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any)
        .from('ai_agent_qualification_flow')
        .delete()
        .eq('agent_id', agentId)
      if (delErr) throw delErr
      if (stages.length === 0) return []
      const rows = stages.map((s, i) => ({ ...s, agent_id: agentId, stage_order: i + 1 }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_qualification_flow')
        .insert(rows)
        .select()
      if (error) throw error
      return (data || []) as QualificationStage[]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyForAgent(agentId) }),
  })

  return {
    stages: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    replaceAll,
  }
}
