import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type ScenarioTriggerType = 'keyword' | 'tag' | 'field_value' | 'intent' | 'custom'

export interface SimplifiedStage {
  question: string
  stage_key?: string
}

export interface SpecialScenario {
  id: string
  agent_id: string
  scenario_name: string
  trigger_type: ScenarioTriggerType
  trigger_config: Record<string, unknown>
  response_adjustment: string | null
  simplified_qualification: SimplifiedStage[] | null
  skip_fee_presentation: boolean
  skip_meeting_scheduling: boolean
  auto_assign_tag: string | null
  handoff_message: string | null
  target_agent_id: string | null
  enabled: boolean
  priority: number
  created_at: string
}

export type SpecialScenarioInput = Omit<SpecialScenario, 'id' | 'agent_id' | 'created_at'>

const keyForAgent = (agentId?: string) => ['agent-special-scenarios', agentId ?? 'none']

export function useAgentSpecialScenarios(agentId?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keyForAgent(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_special_scenarios')
        .select('*')
        .eq('agent_id', agentId)
        .order('priority', { ascending: false })
      if (error) throw error
      return (data || []) as SpecialScenario[]
    },
  })

  const replaceAll = useMutation({
    mutationFn: async (scenarios: SpecialScenarioInput[]) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any)
        .from('ai_agent_special_scenarios')
        .delete()
        .eq('agent_id', agentId)
      if (delErr) throw delErr
      if (scenarios.length === 0) return []
      const rows = scenarios.map((s) => ({ ...s, agent_id: agentId }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_special_scenarios')
        .insert(rows)
        .select()
      if (error) throw error
      return (data || []) as SpecialScenario[]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyForAgent(agentId) }),
  })

  return {
    scenarios: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    replaceAll,
  }
}
