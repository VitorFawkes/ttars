import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AiConversation {
  id: string
  org_id: string
  contact_id: string | null
  card_id: string | null
  primary_agent_id: string | null
  current_agent_id: string | null
  human_agent_id: string | null
  status: 'active' | 'waiting' | 'escalated' | 'completed' | 'archived'
  intent: string | null
  tags: string[]
  message_count: number
  ai_message_count: number
  human_message_count: number
  escalation_reason: string | null
  escalation_at: string | null
  resolution_status: string | null
  phone_number_id: string | null
  started_at: string
  ended_at: string | null
  created_at: string
  // Joins
  contatos?: { id: string; nome: string; sobrenome: string | null; telefone: string | null } | null
  cards?: { id: string; titulo: string; produto: string } | null
  ai_agents?: { id: string; nome: string; tipo: string } | null
}

export interface AiConversationTurn {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agent_id: string | null
  skills_used: Array<Record<string, unknown>>
  context_used: Record<string, unknown>
  reasoning: string | null
  detected_sentiment: string | null
  detected_intent: string | null
  is_fallback: boolean
  confidence: number
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  ai_agents?: { id: string; nome: string } | null
}

export interface ConversationFilters {
  agentId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}

const CONV_KEY = ['ai-conversations']

export function useAiConversations(filters: ConversationFilters = {}) {
  return useQuery({
    queryKey: [...CONV_KEY, filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('ai_conversations')
        .select(`
          *,
          contatos(id, nome, sobrenome, telefone),
          cards(id, titulo, produto),
          ai_agents!ai_conversations_primary_agent_id_fkey(id, nome, tipo)
        `)
        .order('created_at', { ascending: false })
        .limit(filters.limit || 50)

      if (filters.agentId) q = q.eq('primary_agent_id', filters.agentId)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as AiConversation[]
    },
  })
}

export function useAiConversationTurns(conversationId: string | undefined) {
  return useQuery({
    queryKey: [...CONV_KEY, 'turns', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_conversation_turns')
        .select('*, ai_agents(id, nome)')
        .eq('conversation_id', conversationId)
        .order('created_at')

      if (error) throw error
      return (data || []) as AiConversationTurn[]
    },
    enabled: !!conversationId,
  })
}

export function useAiAgentMetrics(agentId: string | undefined, days: number = 30) {
  return useQuery({
    queryKey: ['ai-agent-metrics', agentId, days],
    queryFn: async () => {
      if (!agentId) return []
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - days)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_metrics')
        .select('*')
        .eq('agent_id', agentId)
        .eq('period', 'daily')
        .gte('date_bucket', fromDate.toISOString().split('T')[0])
        .order('date_bucket')

      if (error) throw error
      return (data || []) as Array<{
        id: string
        agent_id: string
        date_bucket: string
        conversations_started: number
        conversations_completed: number
        conversations_escalated: number
        avg_sentiment_score: number | null
        resolution_rate: number | null
        handoff_rate: number | null
        avg_turns_per_conversation: number | null
        total_input_tokens: number
        total_output_tokens: number
      }>
    },
    enabled: !!agentId,
  })
}
