import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface PlaybookMoment {
  id: string
  agent_id: string
  moment_key: string
  moment_label: string
  display_order: number
  trigger_type: 'primeiro_contato' | 'lead_respondeu' | 'keyword' | 'score_threshold' | 'always' | 'custom' | 'manual'
  trigger_config: Record<string, unknown>
  message_mode: 'literal' | 'faithful' | 'free'
  anchor_text: string | null
  red_lines: string[]
  collects_fields: string[]
  enabled: boolean
}

export type PlaybookMomentInput = Omit<PlaybookMoment, 'id' | 'agent_id'>

export function useAgentMoments(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-moments', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_moments')
        .select('*')
        .eq('agent_id', agentId)
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data || []) as PlaybookMoment[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: PlaybookMomentInput & { id?: string }) => {
      if (!agentId) throw new Error('agentId required')
      const row = { ...input, agent_id: agentId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_moments')
        .upsert(row, { onConflict: 'agent_id,moment_key' })
        .select()
        .single()
      if (error) throw error
      return data as PlaybookMoment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  const remove = useMutation({
    mutationFn: async (momentId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('ai_agent_moments').delete().eq('id', momentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  const reorder = useMutation({
    mutationFn: async (ordered: Array<{ id: string; display_order: number }>) => {
      if (!agentId) throw new Error('agentId required')
      // Batch update — Supabase não tem batch direto, faz um por um.
      for (const item of ordered) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ai_agent_moments').update({ display_order: item.display_order }).eq('id', item.id)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  return {
    moments: query.data ?? [],
    isLoading: query.isLoading,
    upsert,
    remove,
    reorder,
  }
}
