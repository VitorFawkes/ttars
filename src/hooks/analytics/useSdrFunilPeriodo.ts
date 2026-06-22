import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

/**
 * Funil de pré-venda (SDR) por PERÍODO/throughput — responde às 4 perguntas da gestora:
 * quantos agendaram reunião, realizaram a reunião, foram qualificados e desqualificados pelo SDR,
 * tudo respeitando o período/filtros selecionados (RPC analytics_sdr_funil_periodo).
 *
 * Contagem por evento dentro do período (lente "atividade"), não por foto do agora — por isso
 * "agendaram" não subconta quem já avançou. Ver migration 20260622a.
 */
export interface SdrFunilPeriodo {
  entraram: number
  conectaram: number
  agendaram_reuniao: number
  realizaram_reuniao: number
  qualificados: number
  desqualificados: number
}

const EMPTY: SdrFunilPeriodo = {
  entraram: 0,
  conectaram: 0,
  agendaram_reuniao: 0,
  realizaram_reuniao: 0,
  qualificados: 0,
  desqualificados: 0,
}

export function useSdrFunilPeriodo() {
  const { dateRange, product, ownerIds, origins, tagIds } = useAnalyticsFilters()

  return useQuery({
    queryKey: [
      'analytics', 'sdr_funil_periodo',
      dateRange.start, dateRange.end, product, ownerIds, origins, tagIds,
    ],
    queryFn: async (): Promise<SdrFunilPeriodo> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
      const { data, error } = await (supabase.rpc as any)('analytics_sdr_funil_periodo', {
        p_date_start: dateRange.start,
        p_date_end: dateRange.end,
        p_product: product,
        p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
        p_origens: origins.length > 0 ? origins : undefined,
        p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
      })
      if (error) throw error
      return ((data as SdrFunilPeriodo[] | null)?.[0]) ?? EMPTY
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
