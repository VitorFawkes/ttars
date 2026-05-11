import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ValidatorVerdict {
  decision: 'PUBLICAR' | 'REGEN' | 'ESCALAR'
  red_lines_hit: Array<{ rule: string; match: string; instruction: string }>
  reason?: string
}

export interface TurnLog {
  id: string
  turn_id: string
  agent_id: string
  conversation_id: string
  attempt_number: number
  prompt_system: string | null
  prompt_user: string | null
  raw_response: string | null
  final_messages: string[] | null
  model_used: string | null
  temperature_used: number | null
  max_tokens_used: number | null
  tool_calls: unknown[]
  validator_verdict: ValidatorVerdict | null
  slot_in_focus: string | null
  duration_ms: number | null
  prompt_builder_version: string | null
  discovery_config_hash: string | null
  created_at: string
}

/**
 * Retorna todas as tentativas (attempts) registradas para um turn da Estela.
 * Quando há REGEN, retorna 2 linhas (attempt_number=1 e 2). Quando o
 * validator publicou direto, retorna 1 linha.
 */
export function useTurnLog(turnId: string | null | undefined) {
  return useQuery({
    queryKey: ['ai-agent-turn-log', turnId],
    enabled: !!turnId,
    queryFn: async (): Promise<TurnLog[]> => {
      if (!turnId) return []
      const { data, error } = await supabase
        .from('ai_agent_turn_logs')
        .select('*')
        .eq('turn_id', turnId)
        .order('attempt_number', { ascending: true })
      if (error) throw error
      return (data ?? []) as TurnLog[]
    },
  })
}
