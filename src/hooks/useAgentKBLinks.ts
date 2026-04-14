import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AgentKBLink {
  id: string
  agent_id: string
  kb_id: string
  shared_with_account: boolean
  org_id: string
  ai_knowledge_bases?: {
    id: string
    nome: string
    tipo: string
    descricao: string | null
    ativa: boolean
  } | null
}

const KEY = (agentId?: string) => ['ai-agent-kb-links', agentId]

export function useAgentKBLinks(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: KEY(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_kb_links')
        .select(`
          id, agent_id, kb_id, shared_with_account, org_id,
          ai_knowledge_bases(id, nome, tipo, descricao, ativa)
        `)
        .eq('agent_id', agentId!)
      if (error) throw error
      return (data || []) as AgentKBLink[]
    },
  })

  const link = useMutation({
    mutationFn: async ({ kb_id, shared_with_account = false }: { kb_id: string; shared_with_account?: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_kb_links')
        .insert({ agent_id: agentId, kb_id, shared_with_account })
        .select()
        .single()
      if (error) throw error
      return data as AgentKBLink
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(agentId) }),
  })

  const unlink = useMutation({
    mutationFn: async (linkId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_kb_links')
        .delete()
        .eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(agentId) }),
  })

  const toggleShared = useMutation({
    mutationFn: async ({ linkId, shared }: { linkId: string; shared: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_kb_links')
        .update({ shared_with_account: shared, updated_at: new Date().toISOString() })
        .eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(agentId) }),
  })

  return {
    links: query.data || [],
    isLoading: query.isLoading,
    link,
    unlink,
    toggleShared,
  }
}
