import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type AgentTipo = 'sales' | 'support' | 'success' | 'specialist' | 'router'

export interface AiAgent {
  id: string
  org_id: string
  produto: string
  nome: string
  descricao: string | null
  persona: string | null
  ativa: boolean
  modelo: string
  temperature: number
  max_tokens: number
  system_prompt: string
  system_prompt_version: number
  tipo: AgentTipo
  routing_criteria: Record<string, unknown>
  escalation_rules: Array<Record<string, unknown>>
  memory_config: Record<string, unknown>
  fallback_message: string | null
  fallback_agent_id: string | null
  n8n_webhook_url: string | null
  execution_backend: 'edge_function' | 'n8n' | 'external_webhook'
  external_config: Record<string, unknown> | null
  interaction_mode: 'inbound' | 'outbound' | 'hybrid'
  first_message_config: Record<string, unknown> | null
  outbound_trigger_config: Record<string, unknown> | null
  // C1 — configurações avançadas do agente (JSONB, populadas pelo editor C2)
  handoff_signals?: Array<{ slug: string; enabled: boolean; description: string }> | null
  intelligent_decisions?: Record<string, { enabled: boolean; config: Record<string, unknown> }> | null
  validator_rules?: Array<{ id: string; condition: string; action: 'block' | 'correct' | 'ignore'; enabled: boolean }> | null
  timings?: { debounce_seconds: number; typing_delay_seconds: number; max_message_blocks: number } | null
  pipeline_models?: Record<string, { model: string; temperature: number; max_tokens: number }> | null
  multimodal_config?: { audio: boolean; image: boolean; pdf: boolean } | null
  context_fields_config?: { visible_fields?: string[]; updatable_fields?: string[]; evidence_level?: Record<string, 'low' | 'medium' | 'high'> } | null
  handoff_actions?: { change_stage_id?: string | null; apply_tag?: { color: string; name: string } | null; notify_responsible?: boolean; transition_message?: string | null; pause_permanently?: boolean } | null
  prompts_extra?: { context?: string; data_update?: string; formatting?: string; validator?: string } | null
  created_by: string | null
  created_at: string
  updated_at: string
  ativa_changed_at: string | null
  ativa_changed_by: string | null
  // Joins
  ai_agent_skills?: Array<{
    id: string
    skill_id: string
    enabled: boolean
    priority: number
    config_override?: Record<string, unknown> | null
    ai_skills: { id: string; nome: string; categoria: string; tipo: string } | null
  }>
  ai_agent_phone_line_config?: Array<{
    id: string
    phone_line_id: string
    ativa: boolean
    priority: number
    routing_filter: { allowed_phones?: string[] } | null
    whatsapp_linha_config?: {
      phone_number_label: string | null
      phone_number_id: string | null
    } | null
  }>
  ativa_changed_by_profile?: {
    id: string
    nome: string | null
  } | null
  // Computed (via RPC ou count)
  _conversations_count?: number
}

export interface AiAgentInput {
  produto: string
  nome: string
  descricao?: string | null
  persona?: string | null
  ativa?: boolean
  modelo?: string
  temperature?: number
  max_tokens?: number
  system_prompt: string
  tipo: AgentTipo
  routing_criteria?: Record<string, unknown>
  escalation_rules?: Array<Record<string, unknown>>
  memory_config?: Record<string, unknown>
  fallback_message?: string | null
  fallback_agent_id?: string | null
  n8n_webhook_url?: string | null
}

const QUERY_KEY = ['ai-agents']

export function useAiAgents(produto?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, produto],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('ai_agents')
        .select(`
          *,
          ai_agent_skills(id, skill_id, enabled, priority, ai_skills(id, nome, categoria, tipo)),
          ai_agent_phone_line_config(id, phone_line_id, ativa, priority)
        `)
        .order('created_at', { ascending: false })

      if (produto) q = q.eq('produto', produto)

      const { data, error } = await q
      if (error) throw error
      return (data || []) as AiAgent[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: AiAgentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as AiAgent
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AiAgentInput> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as AiAgent
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const toggleAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ ativa, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: original, error: fetchErr } = await (supabase as any)
        .from('ai_agents')
        .select('*')
        .eq('id', id)
        .single()
      if (fetchErr || !original) throw fetchErr || new Error('Not found')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { id: _id, created_at: _ca, updated_at: _ua, org_id: _oid, ...rest } = original as any
      void _id; void _ca; void _ua; void _oid;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .insert({ ...rest, nome: `${rest.nome} (cópia)`, ativa: false })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })

  return {
    agents: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    toggleAtiva,
    remove,
    duplicate,
  }
}

export function useTogglePhoneLineConfig(agentId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ configId, ativa }: { configId: string; ativa: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_phone_line_config')
        .update({ ativa })
        .eq('id', configId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'detail', agentId] })
      }
    },
  })
}

// Atualiza o routing_filter de um vínculo agente↔linha.
// Passar `{ allowed_phones: [...] }` para restringir a lista; passar null para desativar o filtro.
export function useUpdatePhoneLineRoutingFilter(agentId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ configId, routingFilter }: {
      configId: string
      routingFilter: { allowed_phones: string[] } | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_phone_line_config')
        .update({ routing_filter: routingFilter })
        .eq('id', configId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, 'detail', agentId] })
      }
    },
  })
}

export interface EnqueueTestOutboundResult {
  ok: boolean
  queue_id?: string
  agent_nome?: string
  agent_ativa?: boolean
  phone?: string
  note?: string
  error?: string
  hint?: string
}

// Chama o RPC enqueue_test_outbound para disparar manualmente uma primeira mensagem
// de teste para um telefone específico. Requer contato + card já existentes na org.
export function useEnqueueTestOutbound() {
  return useMutation({
    mutationFn: async ({ agentId, phone }: { agentId: string; phone: string }): Promise<EnqueueTestOutboundResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('enqueue_test_outbound', {
        p_agent_id: agentId,
        p_phone: phone,
      })
      if (error) throw error
      return data as EnqueueTestOutboundResult
    },
  })
}

export function useAiAgentDetail(agentId: string | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, 'detail', agentId],
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select(`
          *,
          ai_agent_skills(id, skill_id, enabled, priority, config_override, ai_skills(*)),
          ai_agent_phone_line_config(id, phone_line_id, ativa, priority, routing_filter, whatsapp_linha_config(phone_number_label, phone_number_id)),
          ai_agent_prompts(id, version, is_active, variant_name, is_variant, total_conversations, avg_resolution_rate, created_at),
          ativa_changed_by_profile:profiles!ai_agents_ativa_changed_by_fkey(id, nome)
        `)
        .eq('id', agentId)
        .single()
      if (error) throw error
      return data as AiAgent & {
        ai_agent_prompts: Array<{
          id: string
          version: number
          is_active: boolean
          variant_name: string | null
          is_variant: boolean
          total_conversations: number
          avg_resolution_rate: number | null
          created_at: string
        }>
      }
    },
    enabled: !!agentId,
  })
}
