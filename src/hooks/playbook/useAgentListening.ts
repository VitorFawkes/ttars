import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface ListeningConfig {
  echo_social_questions?: boolean
  acknowledge_observations?: boolean
  handle_message_bursts?: boolean
  never_ignore_lead?: boolean
  examples?: string[]
}

export const DEFAULT_LISTENING: Required<ListeningConfig> = {
  echo_social_questions: true,
  acknowledge_observations: true,
  handle_message_bursts: true,
  never_ignore_lead: true,
  examples: [],
}

export function useAgentListening(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-listening', agentId],
    enabled: !!agentId,
    queryFn: async (): Promise<ListeningConfig | null> => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('listening_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.listening_config as ListeningConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: ListeningConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ listening_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-listening', agentId] })
    },
  })

  return {
    listening: query.data,
    isLoading: query.isLoading,
    save,
  }
}
