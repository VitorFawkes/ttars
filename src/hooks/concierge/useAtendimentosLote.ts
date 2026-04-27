import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { AtendimentoLote } from './types'

export function useAtendimentosLote() {
  return useQuery({
    queryKey: ['concierge', 'em-lote'],
    queryFn: async (): Promise<AtendimentoLote[]> => {
      const { data, error } = await sbAny
        .from('v_atendimentos_lote')
        .select('*')

      if (error) throw error
      return (data ?? []) as AtendimentoLote[]
    },
    staleTime: 30 * 1000,
  })
}
