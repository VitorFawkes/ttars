import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TurnLog } from './useTurnLog'

/**
 * Retorna logs agrupados por turn_id pra mapear ícone 'Ver execução' em
 * cada mensagem da Estela na tela da conversa.
 */
export function useTurnLogsForConversation(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['ai-agent-turn-logs-conversation', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<Record<string, TurnLog[]>> => {
      if (!conversationId) return {}
      // ai_agent_turn_logs ainda não está em database.types.ts — cast inline.
      const { data, error } = await (supabase.from as never)('ai_agent_turn_logs')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw error
      const grouped: Record<string, TurnLog[]> = {}
      for (const log of ((data ?? []) as unknown) as TurnLog[]) {
        if (!grouped[log.turn_id]) grouped[log.turn_id] = []
        grouped[log.turn_id].push(log)
      }
      return grouped
    },
  })
}
