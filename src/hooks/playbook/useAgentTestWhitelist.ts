import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const queryKey = (agentId: string | undefined) => ['agent-test-whitelist', agentId]

/**
 * Whitelist de telefones autorizados a falar com o agente em modo teste.
 * Mora em ai_agents.test_mode_phone_whitelist (TEXT[]). Telefones são
 * normalizados pra apenas dígitos antes de gravar.
 */
export function useAgentTestWhitelist(agentId: string | undefined) {
  const queryClient = useQueryClient()

  const { data: whitelist = [], isLoading } = useQuery<string[]>({
    queryKey: queryKey(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      const { data, error } = await supabase
        .from('ai_agents')
        .select('test_mode_phone_whitelist')
        .eq('id', agentId)
        .single()
      if (error) throw error
      const list = (data as { test_mode_phone_whitelist?: string[] | null }).test_mode_phone_whitelist
      return list ?? []
    },
  })

  const save = useMutation({
    mutationFn: async (next: string[]) => {
      if (!agentId) throw new Error('Sem agente')
      const cleaned = next
        .map(p => p.replace(/\D/g, ''))
        .filter(p => p.length >= 8)
      const unique = Array.from(new Set(cleaned))
      const { error } = await supabase
        .from('ai_agents')
        .update({ test_mode_phone_whitelist: unique })
        .eq('id', agentId)
      if (error) throw error
      return unique
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey(agentId), saved)
    },
  })

  return {
    whitelist,
    isLoading,
    save: (next: string[]) => save.mutateAsync(next),
    isSaving: save.isPending,
  }
}
