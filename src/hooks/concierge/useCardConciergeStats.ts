import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { CardConciergeStats } from './types'

/**
 * Stats agregados de concierge por card. Usado em badges do kanban,
 * header do card e seção overview.
 */
export function useCardConciergeStats(cardId: string | null | undefined) {
  return useQuery({
    queryKey: ['concierge', 'card-stats', cardId],
    queryFn: async (): Promise<CardConciergeStats | null> => {
      if (!cardId) return null
      const { data, error } = await sbAny
        .from('v_card_concierge_stats')
        .select('*')
        .eq('card_id', cardId)
        .maybeSingle()

      if (error) throw error
      return (data as CardConciergeStats | null) ?? {
        card_id: cardId,
        ativos: 0,
        vencidos: 0,
        concluidos: 0,
        valor_vendido_extra: 0,
        tipo_prioritario: null,
      }
    },
    enabled: !!cardId,
    staleTime: 30 * 1000,
  })
}

/**
 * Versão batch — recebe array de cardIds e retorna Map<cardId, stats>.
 * Usar no KanbanBoard pra evitar N+1 queries.
 */
export function useCardConciergeStatsBatch(cardIds: string[]) {
  return useQuery({
    queryKey: ['concierge', 'card-stats-batch', cardIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, CardConciergeStats>> => {
      if (!cardIds.length) return new Map()
      const { data, error } = await sbAny
        .from('v_card_concierge_stats')
        .select('*')
        .in('card_id', cardIds)

      if (error) throw error
      const map = new Map<string, CardConciergeStats>()
      for (const row of (data ?? []) as CardConciergeStats[]) {
        map.set(row.card_id, row)
      }
      return map
    },
    enabled: cardIds.length > 0,
    staleTime: 30 * 1000,
  })
}
