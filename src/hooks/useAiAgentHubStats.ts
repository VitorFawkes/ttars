import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AgentHubStat {
  agent_id: string
  conversations_count: number
  resolution_rate: number | null
}

/**
 * Fetch 7-day stats (conversations count + resolution rate) for all agents.
 * Aggregates client-side from ai_conversations to avoid needing a custom RPC.
 */
export function useAiAgentHubStats(agentIds: string[]) {
  return useQuery({
    queryKey: ['ai-agent-hub-stats', [...agentIds].sort()],
    queryFn: async () => {
      if (agentIds.length === 0) return {} as Record<string, AgentHubStat>

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_conversations')
        .select('primary_agent_id, status')
        .in('primary_agent_id', agentIds)
        .gte('created_at', sevenDaysAgo)

      if (error) throw error

      const byAgent: Record<string, { total: number; completed: number }> = {}
      for (const row of (data || []) as Array<{ primary_agent_id: string | null; status: string }>) {
        if (!row.primary_agent_id) continue
        byAgent[row.primary_agent_id] ??= { total: 0, completed: 0 }
        byAgent[row.primary_agent_id].total += 1
        if (row.status === 'completed') byAgent[row.primary_agent_id].completed += 1
      }

      const result: Record<string, AgentHubStat> = {}
      for (const id of agentIds) {
        const s = byAgent[id]
        result[id] = {
          agent_id: id,
          conversations_count: s?.total ?? 0,
          resolution_rate: s && s.total > 0 ? s.completed / s.total : null,
        }
      }
      return result
    },
    enabled: agentIds.length > 0,
    staleTime: 60 * 1000, // 1 min cache
  })
}
