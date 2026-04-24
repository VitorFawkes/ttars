import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface PlaybookSilentSignal {
  id: string
  agent_id: string
  signal_key: string
  signal_label: string
  detection_hint: string
  crm_field_key: string | null
  how_to_use: string | null
  enabled: boolean
  display_order: number
}

export type PlaybookSignalInput = Omit<PlaybookSilentSignal, 'id' | 'agent_id'>

export function useAgentSilentSignals(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-silent-signals', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_silent_signals')
        .select('*')
        .eq('agent_id', agentId)
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data || []) as PlaybookSilentSignal[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: PlaybookSignalInput & { id?: string }) => {
      if (!agentId) throw new Error('agentId required')
      const row = { ...input, agent_id: agentId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_silent_signals')
        .upsert(row, { onConflict: 'agent_id,signal_key' })
        .select()
        .single()
      if (error) throw error
      return data as PlaybookSilentSignal
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-silent-signals', agentId] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('ai_agent_silent_signals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-silent-signals', agentId] }),
  })

  return { signals: query.data ?? [], isLoading: query.isLoading, upsert, remove }
}
