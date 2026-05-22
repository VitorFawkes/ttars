import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
  /**
   * Override do texto que vai pro LLM. Quando preenchido, sobrescreve a
   * descrição padrão da biblioteca (LIBRARY_DESCRIPTIONS no router) sem
   * apagar o `library_id`. Permite admin afinar a regra mantendo o tracking.
   * Em itens custom (sem library_id), o `text` continua sendo a fonte.
   */
  custom_text?: string
}

export interface BoundariesConfig {
  /**
   * Formato V3 (2026-05-21): admin escolhe IDs de uma biblioteca curada
   * de boundaries de MARCA (router resolve o texto via defaults/<agent>_boundaries.ts).
   * Quando vazio/undefined, router usa default_active (todos ON pela curadoria).
   */
  brand_active?: string[]
  /**
   * Nomes de concorrentes específicos a NUNCA mencionar (chips editáveis).
   */
  competitors_to_avoid?: string[]

  /** @deprecated V2: removido em 2026-05-21. */
  by_category?: Record<string, BoundaryItem[]>
  /** @deprecated V2 legacy. */
  library_active?: string[]
  /** @deprecated V2 legacy. */
  custom?: string[]
  /** @deprecated V2 legacy. */
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
