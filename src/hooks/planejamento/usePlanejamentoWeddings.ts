import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useWeddingsWithGuestCounts } from '../convidados/useWeddingsWithGuestCounts'
import type { WeddingWithGuests } from '../convidados/types'
import { displayedEtapaPlanejamento } from './displayedEtapaPlanejamento'
import { isEtapaPlanejamento, type EtapaPlanejamento } from './types'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

export interface WeddingPlanejamento extends WeddingWithGuests {
  /** Coluna atual no board de Planejamento (override manual ou fallback). */
  planejamentoEtapa: EtapaPlanejamento
}

/**
 * Casamentos do board de Planejamento. Reusa exatamente a fonte da área
 * Convidados (mesmos cards WEDDING em pos_venda, com isolamento por org +
 * produto herdado de `useWeddings`), e resolve a coluna de cada casamento:
 *   override manual (wedding_planejamento_state) > fallback pela etapa pos_venda.
 */
export function usePlanejamentoWeddings() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const base = useWeddingsWithGuestCounts()

  // stageId -> nome da etapa pos_venda (pro fallback de coluna).
  const stagesQuery = useQuery<Record<string, string>>({
    queryKey: ['planejamento', 'pos-venda-stages', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const [phaseRes, pipelineRes] = await Promise.all([
        sbAny
          .from('pipeline_phases')
          .select('id')
          .eq('org_id', orgId)
          .eq('slug', POS_VENDA_PHASE_SLUG)
          .maybeSingle(),
        sbAny
          .from('pipelines')
          .select('id')
          .eq('org_id', orgId)
          .eq('produto', 'WEDDING')
          .maybeSingle(),
      ])
      if (phaseRes.error) throw phaseRes.error
      if (pipelineRes.error) throw pipelineRes.error

      const phaseId: string | undefined = phaseRes.data?.id
      const pipelineId: string | undefined = pipelineRes.data?.id
      if (!phaseId || !pipelineId) return {}

      const { data, error } = await sbAny
        .from('pipeline_stages')
        .select('id, nome')
        .eq('phase_id', phaseId)
        .eq('pipeline_id', pipelineId)
      if (error) throw error

      const map: Record<string, string> = {}
      for (const s of (data ?? []) as { id: string; nome: string }[]) map[s.id] = s.nome
      return map
    },
  })

  // card_id -> etapa salva (override manual). Degrada gracioso se a tabela
  // ainda não existir (pré-migration) ou não houver permissão: sem overrides,
  // tudo cai no fallback e o board continua renderizando.
  const stateQuery = useQuery<Record<string, EtapaPlanejamento>>({
    queryKey: ['planejamento', 'state', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const { data, error } = await sbAny
        .from('wedding_planejamento_state')
        .select('card_id, etapa')
        .eq('org_id', orgId)
      if (error) return {}
      const map: Record<string, EtapaPlanejamento> = {}
      for (const r of (data ?? []) as { card_id: string; etapa: string }[]) {
        if (isEtapaPlanejamento(r.etapa)) map[r.card_id] = r.etapa
      }
      return map
    },
  })

  const data = useMemo<WeddingPlanejamento[]>(() => {
    const weddings: WeddingWithGuests[] = base.data ?? []
    const stageMap = stagesQuery.data ?? {}
    const stateMap = stateQuery.data ?? {}
    return weddings.map(w => ({
      ...w,
      planejamentoEtapa: displayedEtapaPlanejamento(
        stateMap[w.id],
        w.pipeline_stage_id ? stageMap[w.pipeline_stage_id] : null,
      ),
    }))
  }, [base.data, stagesQuery.data, stateQuery.data])

  return {
    data,
    isLoading: base.isLoading || stagesQuery.isLoading,
    isError: base.isError,
    error: base.error,
  }
}
