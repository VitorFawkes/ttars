import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface PlaybookFewShotExample {
  id: string
  agent_id: string
  lead_message: string
  agent_response: string
  context_note: string | null
  related_moment_key: string | null
  related_signal_key: string | null
  display_order: number
  enabled: boolean
}

export type PlaybookExampleInput = Omit<PlaybookFewShotExample, 'id' | 'agent_id'>

export function useAgentFewShotExamples(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-few-shot-examples', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_few_shot_examples')
        .select('*')
        .eq('agent_id', agentId)
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data || []) as PlaybookFewShotExample[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: PlaybookExampleInput & { id?: string }) => {
      if (!agentId) throw new Error('agentId required')
      const row = { ...input, agent_id: agentId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_few_shot_examples')
        .upsert(row)
        .select()
        .single()
      if (error) throw error
      return data as PlaybookFewShotExample
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-few-shot-examples', agentId] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('ai_agent_few_shot_examples').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-few-shot-examples', agentId] }),
  })

  return { examples: query.data ?? [], isLoading: query.isLoading, upsert, remove }
}
