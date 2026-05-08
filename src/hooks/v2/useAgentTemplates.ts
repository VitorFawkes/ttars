import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AgentTemplate {
  id: string
  nome: string
  descricao: string | null
  categoria: string
  tipo: string
  default_qualification_flow: Array<{
    stage_order: number
    stage_name: string
    stage_key: string
    question: string
    subquestions?: string[]
    disqualification_triggers?: Array<{ trigger: string; message: string }>
    response_options?: string[]
  }>
  default_special_scenarios: Array<Record<string, unknown>>
  default_business_config: Record<string, unknown>
  default_routing_criteria: Record<string, unknown>
  default_escalation_rules: Array<Record<string, unknown>>
  icon_name: string
  preview_conversation: Array<{ role: string; content: string }>
  is_public: boolean
  is_system: boolean
}

export function useAgentTemplates() {
  return useQuery({
    queryKey: ['ai-agent-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_agent_templates' as any)
        .select('*')
        .eq('is_public', true)
        .order('categoria')

      if (error) throw error
      return (data || []) as unknown as AgentTemplate[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAgentTemplate(id: string | null) {
  return useQuery({
    queryKey: ['ai-agent-template', id],
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('ai_agent_templates' as any)
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as unknown as AgentTemplate
    },
    enabled: !!id,
  })
}
