import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type FieldType =
  | 'mission_one_liner'
  | 'anchor_text'
  | 'typical_phrase'
  | 'forbidden_phrase'
  | 'example_lead_message'
  | 'example_agent_response'
  | 'red_line'
  | 'signal_hint'
  | 'moment_label'
  | 'custom'

export interface SuggestVariationsContext {
  agent_nome?: string
  agent_role?: string
  company_name?: string
  voice_tone_tags?: string[]
  voice_formality?: number
  related_moment_label?: string
  related_lead_message?: string
  industry_hint?: string
}

export interface Suggestion {
  text: string
  rationale: string
}

export interface SuggestVariationsRequest {
  text: string
  field_type: FieldType
  context?: SuggestVariationsContext
  num_variations?: number
}

/**
 * Chama a edge function ai-agent-prompt-variations pra obter 3 sugestões
 * de variação de texto em campos do editor do Playbook.
 */
export function useAgentSuggestVariations() {
  return useMutation({
    mutationFn: async (req: SuggestVariationsRequest) => {
      const { data, error } = await supabase.functions.invoke('ai-agent-prompt-variations', {
        body: req,
      })
      if (error) throw error
      return (data as { suggestions: Suggestion[]; model_used: string })
    },
  })
}
