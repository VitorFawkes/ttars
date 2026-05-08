import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// Views novas (ai_agent_health_stats, ai_agent_recent_errors) não estão em database.types.ts.
// Cast local para escapar do generic estrito do supabase-js sem mexer em types.gen.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface AiAgentHealthRow {
  agent_id: string
  agent_name: string
  ativa: boolean
  org_id: string
  user_turns_24h: number
  agent_turns_24h: number
  input_tokens_24h: number
  output_tokens_24h: number
  user_turns_7d: number
  agent_turns_7d: number
  input_tokens_7d: number
  output_tokens_7d: number
  tool_calls_24h: number
  tool_failures_24h: number
  tool_success_rate_pct: number | null
  whatsapp_failed_24h: number
  whatsapp_blocked_test_24h: number
  conversations_24h: number
  escalated_24h: number
}

export interface AiAgentErrorRow {
  agent_id: string
  created_at: string
  error_source: 'tool_failure' | 'whatsapp_send'
  error_message: string
  details: Record<string, unknown>
  rn: number
}

export function useAiAgentHealthStats() {
  const { org } = useOrg()
  return useQuery({
    queryKey: ['ai-agent-health-stats', org?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_health_stats')
        .select('*')
        .eq('org_id', org?.id || '')
        .order('agent_name', { ascending: true })
      if (error) throw error
      return (data || []) as AiAgentHealthRow[]
    },
    enabled: Boolean(org?.id),
    refetchInterval: 60_000,
  })
}

export function useAiAgentRecentErrors() {
  const { org } = useOrg()
  return useQuery({
    queryKey: ['ai-agent-recent-errors', org?.id],
    queryFn: async () => {
      const { data: agents, error: aerr } = await supabase
        .from('ai_agents')
        .select('id')
        .eq('org_id', org?.id || '')
      if (aerr) throw aerr
      const agentIds = (agents || []).map(a => a.id)
      if (agentIds.length === 0) return [] as AiAgentErrorRow[]

      const { data, error } = await db
        .from('ai_agent_recent_errors')
        .select('*')
        .in('agent_id', agentIds)
        .lte('rn', 5)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as AiAgentErrorRow[]
    },
    enabled: Boolean(org?.id),
    refetchInterval: 60_000,
  })
}
