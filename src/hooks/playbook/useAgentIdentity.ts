import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface IdentityConfig {
  role?: string
  role_custom?: string | null
  mission_one_liner?: string
  company_description_override?: string | null
}

export function useAgentIdentity(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-identity', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('identity_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.identity_config as IdentityConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: IdentityConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ identity_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-identity', agentId] }),
  })

  return { identity: query.data ?? null, isLoading: query.isLoading, save }
}
