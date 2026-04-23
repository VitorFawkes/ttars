import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type PresentationScenario =
  | 'first_contact_inbound'
  | 'first_contact_outbound_form'

export type PresentationMode = 'fixed' | 'concept'

export interface AiAgentPresentation {
  id: string
  agent_id: string
  scenario: PresentationScenario
  mode: PresentationMode
  fixed_template: string | null
  concept_text: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export type AiAgentPresentationInput = Pick<
  AiAgentPresentation,
  'scenario' | 'mode' | 'fixed_template' | 'concept_text' | 'enabled'
>

export const PRESENTATION_SCENARIOS: Array<{
  key: PresentationScenario
  label: string
  description: string
}> = [
  {
    key: 'first_contact_inbound',
    label: 'Primeiro contato — lead chega do zero',
    description:
      'Quando o lead manda a primeira mensagem no WhatsApp sem contexto prévio (ex: indicação, número do cartão). Usada só na primeira resposta do agente.',
  },
  {
    key: 'first_contact_outbound_form',
    label: 'Primeiro contato — pós-formulário',
    description:
      'Quando o agente abre a conversa porque o lead preencheu um formulário no site. Substitui o antigo first_message_config.',
  },
]

const keyForAgent = (agentId?: string) => ['ai-agent-presentations', agentId ?? 'none']

export function useAiAgentPresentations(agentId?: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keyForAgent(agentId),
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_presentations')
        .select('*')
        .eq('agent_id', agentId)
      if (error) throw error
      return (data || []) as AiAgentPresentation[]
    },
  })

  /**
   * Upsert por (agent_id, scenario). Se a linha existir, atualiza; senão, cria.
   * Limpa o campo não-correspondente ao modo para evitar dado órfão.
   */
  const upsert = useMutation({
    mutationFn: async (input: AiAgentPresentationInput) => {
      if (!agentId) throw new Error('agentId required')
      const row = {
        agent_id: agentId,
        scenario: input.scenario,
        mode: input.mode,
        fixed_template: input.mode === 'fixed' ? input.fixed_template : null,
        concept_text: input.mode === 'concept' ? input.concept_text : null,
        enabled: input.enabled,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_presentations')
        .upsert(row, { onConflict: 'agent_id,scenario' })
        .select()
        .single()
      if (error) throw error
      return data as AiAgentPresentation
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyForAgent(agentId) }),
  })

  const remove = useMutation({
    mutationFn: async (scenario: PresentationScenario) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agent_presentations')
        .delete()
        .eq('agent_id', agentId)
        .eq('scenario', scenario)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyForAgent(agentId) }),
  })

  return {
    presentations: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    upsert,
    remove,
  }
}
