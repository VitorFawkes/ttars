import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem } from './types'

export type AtendimentosCardMode = 'self' | 'with-sub-cards'

/**
 * Lista atendimentos de concierge ligados a um card.
 *
 * Modos:
 * - `'self'` (default): retorna SOMENTE atendimentos cujo `card_id` é exatamente
 *   `cardId`. Comportamento original.
 * - `'with-sub-cards'`: retorna atendimentos do card + de todos os sub-cards
 *   filhos. Filtra por `root_card_id = cardId` na view `v_meu_dia_concierge`,
 *   que já resolve `COALESCE(parent_card_id, id)`. Use no card detail do
 *   PRINCIPAL para espelhar tarefas dos sub-cards (cada item traz
 *   `is_from_sub_card` para a UI marcar a origem).
 *
 * Não use `'with-sub-cards'` no card detail de um sub-card — ali queremos
 * só o que é do próprio sub-card.
 */
export function useAtendimentosCard(
  cardId: string | null | undefined,
  mode: AtendimentosCardMode = 'self',
) {
  return useQuery({
    queryKey: ['concierge', 'atendimentos-card', cardId, mode],
    queryFn: async (): Promise<MeuDiaItem[]> => {
      if (!cardId) return []
      const filterColumn = mode === 'with-sub-cards' ? 'root_card_id' : 'card_id'
      const { data, error } = await sbAny
        .from('v_meu_dia_concierge')
        .select('*')
        .eq(filterColumn, cardId)
        .order('concluida', { ascending: true })
        .order('data_vencimento', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data ?? []) as MeuDiaItem[]
    },
    enabled: !!cardId,
    staleTime: 30 * 1000,
  })
}
