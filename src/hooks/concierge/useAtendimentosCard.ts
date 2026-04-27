import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem } from './types'

/**
 * Lista atendimentos de concierge de um card específico, junto com
 * todos os campos da tarefa associada e contexto da viagem.
 *
 * Usa a view v_meu_dia_concierge filtrada por card_id.
 */
export function useAtendimentosCard(cardId: string | null | undefined) {
  return useQuery({
    queryKey: ['concierge', 'atendimentos-card', cardId],
    queryFn: async (): Promise<MeuDiaItem[]> => {
      if (!cardId) return []
      const { data, error } = await sbAny
        .from('v_meu_dia_concierge')
        .select('*')
        .eq('card_id', cardId)
        .order('concluida', { ascending: true })
        .order('data_vencimento', { ascending: true, nullsFirst: false })

      if (error) throw error
      return (data ?? []) as MeuDiaItem[]
    },
    enabled: !!cardId,
    staleTime: 30 * 1000,
  })
}
