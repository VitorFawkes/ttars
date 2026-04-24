import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface V1V2ComparisonRow {
  agent_id: string
  agent_name: string
  agent_version: 'v1' | 'v2'
  conversations: number
  responses: number
  avg_tokens_per_response: number | null
  avg_qual_score: number | null
  escalated_conversations: number
  escalation_rate: number | null
  first_turn_at: string
  last_turn_at: string
}

export interface V1V2ComparisonPair {
  agent_id: string
  agent_name: string
  v1?: V1V2ComparisonRow
  v2?: V1V2ComparisonRow
}

export function useAgentV1V2Comparison(agentId?: string) {
  return useQuery({
    queryKey: ['agent-v1-v2-comparison', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_v1_v2_comparison')
        .select('*')
        .eq('agent_id', agentId)
      if (error) throw error
      const rows = (data || []) as V1V2ComparisonRow[]
      if (rows.length === 0) return null
      return {
        agent_id: agentId,
        agent_name: rows[0].agent_name,
        v1: rows.find(r => r.agent_version === 'v1'),
        v2: rows.find(r => r.agent_version === 'v2'),
      } as V1V2ComparisonPair
    },
  })
}
