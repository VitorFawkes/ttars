import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface BoundariesConfig {
  library_active?: string[]
  /** Legacy: linhas personalizadas sem categoria (viram "Personalizado") */
  custom?: string[]
  /** Novo (Marco 3.2): linhas personalizadas por categoria editável */
  custom_by_category?: Record<string, string[]>
}

export function useAgentBoundaries(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-boundaries', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('boundaries_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.boundaries_config as BoundariesConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: BoundariesConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ boundaries_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-boundaries', agentId] }),
  })

  return { boundaries: query.data ?? null, isLoading: query.isLoading, save }
}
