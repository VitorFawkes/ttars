import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useWeddingsWithGuestCounts } from '../convidados/useWeddingsWithGuestCounts'
import type { WeddingWithGuests, HotelStatus } from '../convidados/types'
import { colunaFromStageNome } from './displayedEtapaPlanejamento'
import { fetchPosVendaStages } from './_posVendaStages'
import type { FornecedorStatus } from './types'

export interface ProducaoFornecedor {
  setor: string
  status: FornecedorStatus
  valor: number | null
}

export interface WeddingProducao extends WeddingWithGuests {
  hotelStatus: HotelStatus | null
  /** Fornecedores de evento já lançados (semente da Produção: foto, make, A&B…). */
  fornecedores: ProducaoFornecedor[]
}

/**
 * Casamentos que JÁ FORAM ENTREGUES para a Produção — estão numa etapa pos_venda
 * fora das 6 de Planejamento (hoje "Produção (em construção)"). Espelha a fonte
 * da área Convidados (mesmos cards WEDDING, isolados por org), filtrando pela
 * etapa de Produção. Enriquecido com hotel + fornecedores (contexto que o time
 * de Produção precisa receber do Planejamento). Isolado por org_id.
 *
 * NOTA: esta é a LIGAÇÃO/base. A tela rica de Produção (eventos E1→E5, blocos de
 * fornecedor, prazos a partir da data do casamento) é construída por cima disto.
 */
export function useProducaoWeddings() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const base = useWeddingsWithGuestCounts()

  // stage_ids de Produção = etapas pos_venda que NÃO são uma das 6 de Planejamento.
  const prodStagesQuery = useQuery<string[]>({
    queryKey: ['producao', 'stages', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const stages = await fetchPosVendaStages(orgId)
      return stages.filter((s) => colunaFromStageNome(s.nome) === null).map((s) => s.id)
    },
  })

  const extrasQuery = useQuery({
    queryKey: ['producao', 'extras', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return { hotel: {} as Record<string, HotelStatus | null>, fornecedores: {} as Record<string, ProducaoFornecedor[]> }
      const [hotelRes, fornRes] = await Promise.all([
        sbAny.from('wedding_hotel').select('card_id, status').eq('org_id', orgId),
        sbAny.from('wedding_fornecedores').select('card_id, setor, status, valor').eq('org_id', orgId),
      ])
      if (hotelRes.error) throw hotelRes.error
      if (fornRes.error) throw fornRes.error
      const hotel: Record<string, HotelStatus | null> = {}
      for (const r of (hotelRes.data ?? []) as { card_id: string; status: HotelStatus | null }[]) {
        hotel[r.card_id] = r.status ?? null
      }
      const fornecedores: Record<string, ProducaoFornecedor[]> = {}
      for (const r of (fornRes.data ?? []) as { card_id: string; setor: string; status: FornecedorStatus; valor: number | null }[]) {
        ;(fornecedores[r.card_id] ??= []).push({ setor: r.setor, status: r.status, valor: r.valor ?? null })
      }
      return { hotel, fornecedores }
    },
  })

  const data = useMemo<WeddingProducao[]>(() => {
    const weddings: WeddingWithGuests[] = base.data ?? []
    const prodStages = new Set(prodStagesQuery.data ?? [])
    const extras = extrasQuery.data ?? { hotel: {}, fornecedores: {} }
    const out: WeddingProducao[] = []
    for (const w of weddings) {
      if (!w.pipeline_stage_id || !prodStages.has(w.pipeline_stage_id)) continue
      out.push({
        ...w,
        hotelStatus: extras.hotel[w.id] ?? null,
        fornecedores: extras.fornecedores[w.id] ?? [],
      })
    }
    return out
  }, [base.data, prodStagesQuery.data, extrasQuery.data])

  return {
    data,
    isLoading: base.isLoading || prodStagesQuery.isLoading,
    isError: base.isError,
    error: base.error,
  }
}
