import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AgentEngineVersion } from '@/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor'

/**
 * Retorna a engine do agente. Usado pra discriminar UI:
 *   - 'v1' (multi_agent_pipeline, ex: Estela) habilita Schema V2 no DiscoveryConfigEditor
 *   - 'v2' (single_agent_v2, ex: Patricia) mantém schema legado
 *
 * Default retornado quando query ainda não rodou: 'v2' (mais seguro).
 */
export function useAgentEngine(agentId: string | null | undefined): AgentEngineVersion {
  const { data } = useQuery({
    queryKey: ['agent-engine', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      const { data, error } = await supabase
        .from('ai_agents')
        .select('engine')
        .eq('id', agentId)
        .maybeSingle()
      if (error) throw error
      return (data?.engine as string | null) ?? null
    },
    staleTime: 1000 * 60 * 5, // 5min — engine raramente muda
  })

  return data === 'multi_agent_pipeline' ? 'v1' : 'v2'
}
