import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Item de uma categoria — pode ter vindo da biblioteca pré-fabricada
 * (com `library_id` populado) ou ser custom (sem `library_id`).
 *
 * UI trata todos iguais: toggle enabled + X pra remover. Backend filtra
 * apenas itens com `enabled === true` ao montar o prompt.
 */
export interface BoundaryItem {
  /** Texto principal (label da biblioteca OU sentença custom). */
  text: string
  /** Subtítulo descritivo opcional — só itens da biblioteca têm. */
  description?: string
  /** Se a regra está ativa pra esse agente. */
  enabled: boolean
  /** ID original da biblioteca; ausente em itens custom. */
  library_id?: string
}

export interface BoundariesConfig {
  /**
   * Novo formato unificado (Marco 3.3 — 2026-05-07):
   * todas as regras (biblioteca pré-fabricada + custom do admin) ficam
   * juntas por categoria, cada uma com toggle enabled + removíveis.
   * Quando este campo existe, os campos legacy abaixo são ignorados.
   */
  by_category?: Record<string, BoundaryItem[]>

  /** @deprecated Legacy: IDs da biblioteca marcados como ativos. */
  library_active?: string[]
  /** @deprecated Legacy: linhas personalizadas sem categoria. */
  custom?: string[]
  /** @deprecated Legacy: personalizadas por categoria (strings simples). */
  custom_by_category?: Record<string, string[]>
}

export function useAgentBoundaries(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-boundaries', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agents')
        .select('boundaries_config')
        .eq('id', agentId)
        .single()
      if (error) throw error
      return (data?.boundaries_config as BoundariesConfig | null) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (config: BoundariesConfig) => {
      if (!agentId) throw new Error('agentId required')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ai_agents')
        .update({ boundaries_config: config })
        .eq('id', agentId)
      if (error) throw error
      return config
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-boundaries', agentId] }),
  })

  return { boundaries: query.data ?? null, isLoading: query.isLoading, save }
}
