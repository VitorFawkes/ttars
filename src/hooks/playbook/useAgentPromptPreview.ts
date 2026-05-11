import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { PlaybookMoment } from './useAgentMoments'
import type { PlaybookSilentSignal } from './useAgentSilentSignals'
import type { PlaybookFewShotExample } from './useAgentFewShotExamples'
import type { IdentityConfig } from './useAgentIdentity'
import type { VoiceConfig } from './useAgentVoice'
import type { BoundariesConfig } from './useAgentBoundaries'

export interface PreviewPlaybookConfig {
  identity_config?: IdentityConfig | null
  voice_config?: VoiceConfig | null
  boundaries_config?: BoundariesConfig | null
  moments?: Omit<PlaybookMoment, 'agent_id'>[]
  silent_signals?: Omit<PlaybookSilentSignal, 'agent_id'>[]
  few_shot_examples?: Omit<PlaybookFewShotExample, 'agent_id'>[]
  scoring_rules?: Array<Record<string, unknown>>
}

export interface PromptPreviewRequest {
  agent_id: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  preview_playbook_config?: PreviewPlaybookConfig
}

export interface PromptPreviewResponse {
  success: boolean
  response: string
  elapsed_ms: number
  tokens: { input: number; output: number }
  prompt_used: string
  modelo: string
  agent_version: 'v1' | 'v2'
  current_moment_key: string | null
  moment_detection_method: string | null
}

/**
 * Chama ai-agent-simulate passando preview_playbook_config pra montar prompt
 * em memória — permite testar configuração ainda não salva no banco.
 */
export function useAgentPromptPreview() {
  return useMutation({
    mutationFn: async (req: PromptPreviewRequest) => {
      const { data, error } = await supabase.functions.invoke('ai-agent-simulate', {
        body: req,
      })
      if (error) throw error
      return data as PromptPreviewResponse
    },
  })
}
