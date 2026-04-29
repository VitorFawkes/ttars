import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type MomentKind = 'flow' | 'play'

/**
 * Prioridade de coleta do slot — define comportamento da agente:
 * - critical:     bloqueia avanço pro Desfecho até preencher (igual required=true legado)
 * - preferred:    pergunta enquanto não qualificou; pula silenciosamente quando atinge score+criticals
 * - nice_to_have: nunca bloqueia; só pergunta se conversa fluir naturalmente, atalho rápido
 *
 * Backward compat: slots antigos sem priority caem em 'critical' se required=true, senão 'preferred'.
 */
export type SlotPriority = 'critical' | 'preferred' | 'nice_to_have'

/** Cada slot da Sondagem: informação a coletar + perguntas escritas (opcionais). */
export interface DiscoverySlot {
  key: string
  label: string
  icon?: string | null
  /** @deprecated Use priority. Mantido pra backward compat. */
  required: boolean
  /** Substitui required. Default 'preferred'. */
  priority?: SlotPriority
  /** Perguntas escritas. Vazio = agente improvisa baseado em label/contexto. */
  questions: string[]
  /** Liga ao campo do CRM (system_fields.field_key) — usado pra ligação visual com critérios. */
  crm_field_key?: string | null
}

/** Resolve priority efetiva considerando backward compat com required. */
export function resolveSlotPriority(slot: DiscoverySlot): SlotPriority {
  if (slot.priority) return slot.priority
  return slot.required ? 'critical' : 'preferred'
}

export interface DiscoveryConfig {
  slots: DiscoverySlot[]
}

export interface PlaybookMoment {
  id: string
  agent_id: string
  moment_key: string
  moment_label: string
  display_order: number
  /**
   * flow = fase do funil (sequencial, ordem importa, lead progride).
   * play = jogada situacional (interrupção por gatilho dentro de qualquer fase).
   */
  kind: MomentKind
  trigger_type: 'primeiro_contato' | 'lead_respondeu' | 'keyword' | 'score_threshold' | 'always' | 'custom' | 'manual'
  trigger_config: Record<string, unknown>
  message_mode: 'literal' | 'faithful' | 'free'
  /**
   * "Por quê" desta fase — 1-2 frases descrevendo a intenção
   * (o que queremos descobrir/transmitir aqui). Separado do anchor_text
   * (que é o "como falar"). Persiste entre trocas de modo.
   */
  intent: string | null
  anchor_text: string | null
  red_lines: string[]
  collects_fields: string[]
  /** Slots da Sondagem (só preenchido em fases de descoberta). */
  discovery_config: DiscoveryConfig | null
  /**
   * Como a agente entrega a resposta nessa fase:
   *   all_at_once   — quebra em até max_message_blocks blocos numa rajada (default).
   *   wait_for_reply — manda apenas UMA mensagem e espera o lead responder antes
   *                    de avançar (útil em abertura: "Oi!" → espera → próxima coisa).
   */
  delivery_mode: 'all_at_once' | 'wait_for_reply'
  enabled: boolean
}

export type PlaybookMomentInput = Omit<PlaybookMoment, 'id' | 'agent_id'>

export function useAgentMoments(agentId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['agent-moments', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_moments')
        .select('*')
        .eq('agent_id', agentId)
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data || []) as PlaybookMoment[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (input: PlaybookMomentInput & { id?: string }) => {
      if (!agentId) throw new Error('agentId required')
      const row = { ...input, agent_id: agentId }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ai_agent_moments')
        .upsert(row, { onConflict: 'agent_id,moment_key' })
        .select()
        .single()
      if (error) throw error
      return data as PlaybookMoment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  const remove = useMutation({
    mutationFn: async (momentId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('ai_agent_moments').delete().eq('id', momentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  const reorder = useMutation({
    mutationFn: async (ordered: Array<{ id: string; display_order: number }>) => {
      if (!agentId) throw new Error('agentId required')
      // Batch update — Supabase não tem batch direto, faz um por um.
      for (const item of ordered) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ai_agent_moments').update({ display_order: item.display_order }).eq('id', item.id)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-moments', agentId] }),
  })

  return {
    moments: query.data ?? [],
    isLoading: query.isLoading,
    upsert,
    remove,
    reorder,
  }
}
