import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export type FaixaInvestimento = {
  faixa: string
  qtd: number
  pct: number
}

export type ConvidadosBucket = {
  bucket: string
  qtd: number
  pct: number
}

export type DestinoDist = {
  destino: string
  qtd: number
  pct: number
}

export type FunnelStage = {
  phase_id: string
  phase_name: string
  phase_order: number | null
  stage_id: string
  stage_name: string
  stage_order: number | null
  leads_count: number
}

export type ConversaoSegmento = {
  faixa?: string
  destino?: string
  total: number
  ganhos: number
  perdidos?: number
  taxa_ganho: number
}

export type TempoFase = {
  phase_name: string
  avg_dias: number
  mediana_dias: number
  amostra: number
}

export type MotivoPerda = {
  motivo: string
  qtd: number
}

export type WeddingsOverviewKpis = {
  total_leads: number
  leads_ganhos: number
  leads_perdidos: number
  leads_abertos: number
  leads_convertidos_efetivo: number
  taxa_conversao: number
  taxa_conversao_efetiva: number
  ticket_medio_fechado: number
  receita_total_fechada: number
}

export type WeddingsOverview = {
  date_start: string
  date_end: string
  pipeline_id: string
  org_id: string
  kpis: WeddingsOverviewKpis
  funnel: FunnelStage[]
  quality: {
    por_faixa: FaixaInvestimento[]
    por_convidados: ConvidadosBucket[]
    por_destino: DestinoDist[]
  }
  service: {
    motivos_perda_sdr: MotivoPerda[]
    motivos_perda_closer: MotivoPerda[]
    tempo_em_fase: TempoFase[]
  }
  conversao_segmento: {
    por_faixa: ConversaoSegmento[]
    por_destino: ConversaoSegmento[]
  }
  error?: string
}

export type WeddingsAnalyticsFilters = {
  dateStart: string
  dateEnd: string
}

export function useWeddingsAnalyticsOverview(filters: WeddingsAnalyticsFilters) {
  const { org } = useOrg()
  const orgId = org?.id

  return useQuery({
    queryKey: ['analytics-weddings', 'overview', orgId, filters.dateStart, filters.dateEnd],
    queryFn: async (): Promise<WeddingsOverview | null> => {
      if (!orgId) return null
      // RPC ainda não está em database.types.ts (criada nesta migration), usar cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('analytics_weddings_overview', {
        p_date_start: filters.dateStart,
        p_date_end: filters.dateEnd,
        p_org_id: orgId,
      })
      if (error) throw error
      return data as WeddingsOverview
    },
    enabled: !!orgId,
    staleTime: 60_000,
  })
}
