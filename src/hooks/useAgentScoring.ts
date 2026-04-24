import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ============================================================================
// Tipos genericos — qualquer agente da plataforma pode usar scoring
// ============================================================================

export type ConditionType = 'equals' | 'range' | 'boolean_true' | 'ai_subjective'
export type RuleType = 'qualify' | 'disqualify' | 'bonus'

/**
 * Valor da condicao armazenado em JSONB. Formato depende do condition_type.
 */
export type ConditionValue =
  | { value: string }
  | { min: number | null; max: number | null }
  | { field: string }
  | { question: string }

export interface ScoringRule {
  id: string
  org_id: string
  agent_id: string
  dimension: string
  condition_type: ConditionType
  condition_value: ConditionValue
  weight: number
  label: string | null
  ordem: number
  ativa: boolean
  rule_type: RuleType
  created_at: string
  updated_at: string
}

export type ScoringRuleInput = Omit<ScoringRule, 'id' | 'org_id' | 'agent_id' | 'created_at' | 'updated_at'> & {
  id?: string
}

export type FallbackAction = 'material_informativo' | 'encerrar_cordial' | 'nota_interna' | 'request_handoff'

export interface ScoringConfig {
  agent_id: string
  org_id: string
  enabled: boolean
  threshold_qualify: number
  fallback_action: FallbackAction | string
  max_sinal_bonus: number
  updated_at: string
}

export type ScoringConfigInput = Partial<Omit<ScoringConfig, 'agent_id' | 'org_id' | 'updated_at'>>

export interface ScoringBreakdownItem {
  dimension: string
  label: string
  weight: number
  rule_id: string
}

export interface ScoringResult {
  enabled: boolean
  score: number | null
  threshold?: number
  qualificado?: boolean | null
  sinal_bonus_applied?: number
  max_sinal_bonus?: number
  breakdown?: ScoringBreakdownItem[]
  message?: string
}

// ============================================================================
// Default config (agente novo comeca desligado)
// ============================================================================

export const DEFAULT_SCORING_CONFIG: ScoringConfigInput = {
  enabled: false,
  threshold_qualify: 25,
  fallback_action: 'material_informativo',
  max_sinal_bonus: 10,
}

// ============================================================================
// Hook principal
// ============================================================================

const configKey = (agentId?: string) => ['agent-scoring-config', agentId ?? 'none']
const rulesKey = (agentId?: string) => ['agent-scoring-rules', agentId ?? 'none']

export function useAgentScoring(agentId?: string) {
  const queryClient = useQueryClient()

  // --------------------------------------------------------------------------
  // Config (1 row por agente)
  // --------------------------------------------------------------------------
  const configQuery = useQuery({
    queryKey: configKey(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_scoring_config')
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ScoringConfig | null
    },
  })

  const upsertConfig = useMutation({
    mutationFn: async (input: ScoringConfigInput) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_scoring_config')
        .upsert(
          { agent_id: agentId, ...input, updated_at: new Date().toISOString() },
          { onConflict: 'agent_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data as ScoringConfig
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKey(agentId) }),
  })

  // --------------------------------------------------------------------------
  // Regras (N rows por agente, agrupadas por dimension)
  // --------------------------------------------------------------------------
  const rulesQuery = useQuery({
    queryKey: rulesKey(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_scoring_rules')
        .select('*')
        .eq('agent_id', agentId)
        .order('dimension')
        .order('ordem')
      if (error) throw error
      return (data ?? []) as ScoringRule[]
    },
  })

  const upsertRule = useMutation({
    mutationFn: async (input: ScoringRuleInput) => {
      if (!agentId) throw new Error('agentId required')
      const { id, ...rest } = input
      const payload = {
        ...rest,
        agent_id: agentId,
        updated_at: new Date().toISOString(),
      }
      if (id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('ai_agent_scoring_rules')
          .update(payload)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data as ScoringRule
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('ai_agent_scoring_rules')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as ScoringRule
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(agentId) }),
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_scoring_rules')
        .delete()
        .eq('id', ruleId)
      if (error) throw error
      return ruleId
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey(agentId) }),
  })

  // --------------------------------------------------------------------------
  // Simulador — chama a RPC para testar inputs hipoteticos
  // --------------------------------------------------------------------------
  const simulate = useMutation({
    mutationFn: async (inputs: Record<string, unknown>) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('calculate_agent_qualification_score', {
        p_agent_id: agentId,
        p_inputs: inputs,
      })
      if (error) throw error
      return data as ScoringResult
    },
  })

  return {
    config: configQuery.data ?? null,
    rules: rulesQuery.data ?? [],
    isLoading: configQuery.isLoading || rulesQuery.isLoading,
    error: configQuery.error || rulesQuery.error,
    upsertConfig,
    upsertRule,
    deleteRule,
    simulate,
  }
}
