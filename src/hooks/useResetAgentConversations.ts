import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ResetResult {
  success: boolean
  contacts_found: number
  conversations_deleted: number
  turns_deleted: number
  state_deleted: number
  buffer_deleted: number
  outbound_deleted: number
  messages_deleted: number
  contacts_cleared: number
  cards_cleared: number
  message?: string
}

/**
 * Zera histórico + memória de conversas de um agente IA com os contatos
 * de um telefone específico. Usado no botão "Resetar conversa" do editor
 * pra testes — não apaga whatsapp_messages/contatos/cards.
 */
export function useResetAgentConversations(agentId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (phone: string): Promise<ResetResult> => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('reset_agent_conversations_with_phone', {
        p_agent_id: agentId,
        p_phone: phone,
      })
      if (error) throw error
      return data as ResetResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['ai-agent-health'] })
    },
  })
}
