import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface VoiceConfig {
  tone_tags?: string[]
  formality?: number
  /**
   * Lista LIVRE de regras de tom — admin escreve o que quiser.
   * Ex: "Não usa emoji em primeira mensagem", "Diz 'a gente' em vez de 'nós'",
   *     "Cumprimenta pelo primeiro nome", "Sotaque levemente carioca".
   *
   * Substituiu emoji_policy + regionalisms (que viraram apenas presets clicáveis
   * na UI). Se rules estiver vazio mas os campos antigos preenchidos, a UI
   * deriva rules a partir deles automaticamente.
   *
   * Vai pro prompt como bullets no bloco <voice>.
   */
  rules?: string[]
  typical_phrases?: string[]
  forbidden_phrases?: string[]

  // ── Campos LEGADO (mantidos pra compatibilidade com agentes ainda
  // não migrados). Não use no UI v3+. Renderização preferencial usa `rules`.
  emoji_policy?: 'never' | 'after_rapport' | 'anytime'
  regionalisms?: {
    uses_a_gente?: boolean
    uses_voces_casal?: boolean
    uses_gerundio?: boolean
    casual_tu_mano?: boolean
  }
  /** @deprecated Renomeado pra `rules` em 2026-04-30. Lê com fallback. */
  custom_rules?: string[]
}

export function useAgentVoice(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-voice', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('voice_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.voice_config as VoiceConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: VoiceConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ voice_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-voice', agentId] }),
  })

  return { voice: query.data ?? null, isLoading: query.isLoading, save }
}
