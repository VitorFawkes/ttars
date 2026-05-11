import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type AgentTone = 'formal' | 'professional' | 'friendly' | 'casual' | 'empathetic'
export type PricingModel = 'flat' | 'percentage' | 'tiered' | 'free' | 'custom'
export type FeeTiming = 'immediately' | 'after_discovery' | 'after_qualification' | 'at_commitment' | 'never'
export type CalendarSystem = 'calendly' | 'google' | 'n8n' | 'supabase_rpc' | 'none'

export interface BusinessCustomBlock {
  title: string
  content: string
}

export interface BusinessConfig {
  id: string
  agent_id: string
  company_name: string | null
  company_description: string | null
  tone: AgentTone | null
  language: string | null
  pricing_model: PricingModel | null
  pricing_json: Record<string, unknown>
  fee_presentation_timing: FeeTiming | null
  process_steps: string[]
  methodology_text: string | null
  calendar_system: CalendarSystem | null
  calendar_config: Record<string, unknown>
  protected_fields: string[]
  auto_update_fields: string[]
  contact_update_fields: string[]
  form_data_fields: string[]
  has_secondary_contacts: boolean
  secondary_contact_role_name: string
  secondary_contact_fields: string[]
  escalation_triggers: Array<Record<string, unknown>>
  custom_blocks: BusinessCustomBlock[]
  created_at: string
  updated_at: string
}

export type BusinessConfigInput = Partial<Omit<BusinessConfig, 'id' | 'agent_id' | 'created_at' | 'updated_at'>>

export const DEFAULT_BUSINESS_CONFIG: BusinessConfigInput = {
  company_name: '',
  company_description: '',
  tone: 'friendly',
  language: 'pt-BR',
  // Default é null/never: agente não aborda preço a menos que seja explicitamente configurado.
  // O BusinessConfigEditor ajusta o timing automaticamente quando o usuário escolhe um pricing_model.
  pricing_model: null,
  pricing_json: {},
  fee_presentation_timing: 'never',
  process_steps: [],
  methodology_text: '',
  calendar_system: 'supabase_rpc',
  calendar_config: { rpc_name: 'agent_check_calendar' },
  protected_fields: ['pessoa_principal_id', 'produto_data', 'valor_estimado', 'contato.telefone'],
  auto_update_fields: ['titulo', 'ai_resumo', 'ai_contexto', 'pipeline_stage_id'],
  contact_update_fields: ['nome', 'sobrenome', 'email', 'cpf', 'passaporte', 'data_nascimento', 'endereco', 'observacoes'],
  form_data_fields: [],
  has_secondary_contacts: false,
  secondary_contact_role_name: 'traveler',
  secondary_contact_fields: [],
  escalation_triggers: [],
  custom_blocks: [],
}

const keyForAgent = (agentId?: string) => ['agent-business-config', agentId ?? 'none']

export function useAgentBusinessConfig(agentId?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keyForAgent(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_business_config')
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as BusinessConfig | null
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: BusinessConfigInput) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_business_config')
        .upsert({ agent_id: agentId, ...input, updated_at: new Date().toISOString() }, { onConflict: 'agent_id' })
        .select()
        .single()
      if (error) throw error
      return data as BusinessConfig
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyForAgent(agentId) }),
  })

  return {
    config: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    upsert,
  }
}
