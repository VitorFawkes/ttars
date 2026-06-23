import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useWeddingsWithGuestCounts } from '../convidados/useWeddingsWithGuestCounts'
import type { WeddingWithGuests, HotelStatus } from '../convidados/types'
import { displayedEtapaPlanejamento } from './displayedEtapaPlanejamento'
import { isEtapaPlanejamento, PLANEJ_FIELD, type EtapaPlanejamento, type FornecedorStatus } from './types'
import { computeGate, type GateResult, type GateTask } from './planejamentoGate'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

export interface PlanejamentoFornecedor {
  setor: string
  status: FornecedorStatus
  valor: number | null
}

export interface PlanejamentoChecklistResumo {
  total: number
  feitos: number
  comPrazo: number
  /** Itens com prazo vencido e ainda não feitos. */
  atrasados: number
  /** Itens não feitos (pendentes), independente de prazo. */
  pendentes: number
}

export interface WeddingPlanejamento extends WeddingWithGuests {
  /** Coluna atual no board de Planejamento (override manual ou fallback). */
  planejamentoEtapa: EtapaPlanejamento
  /** Resultado da trava da etapa atual (o que falta pra avançar). */
  gate: GateResult
  hotelStatus: HotelStatus | null
  hotelTarifa: number | null
  /** Quartos do bloco no hotel — fonte única de "quartos a bloquear". */
  hotelQuartos: number | null
  convitesCount: number
  fornecedores: PlanejamentoFornecedor[]
  checklist: PlanejamentoChecklistResumo
}

/**
 * Casamentos do board de Planejamento. Reusa a fonte da área Convidados (mesmos
 * cards WEDDING em pos_venda, isolados por org + produto) e enriquece com:
 *   - coluna atual: override manual (wedding_planejamento_state) > fallback etapa pos_venda
 *   - dados das travas: hotel, convites, checklist e fornecedores (por card)
 *   - a trava calculada da etapa atual.
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
        sbAny.from('pipeline_phases').select('id').eq('org_id', orgId).eq('slug', POS_VENDA_PHASE_SLUG).maybeSingle(),
        sbAny.from('pipelines').select('id').eq('org_id', orgId).eq('produto', 'WEDDING').maybeSingle(),
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
  // ainda não existir ou não houver permissão.
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

  // Dados das travas (hotel/convites/checklist/fornecedores), por card. Sempre
  // filtrados por org_id. Degrada gracioso (sem dados → trava só com o que tem).
  const gateDataQuery = useQuery({
    queryKey: ['planejamento', 'gate-data', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) {
        return { hotel: {}, convites: {}, checklist: {}, fornecedores: {}, tasks: {} } as GateData
      }
      const [hotelRes, convitesRes, checklistRes, fornRes] = await Promise.all([
        sbAny.from('wedding_hotel').select('card_id, status, tarifa, total_quartos').eq('org_id', orgId),
        sbAny.from('wedding_convites').select('card_id').eq('org_id', orgId),
        sbAny.from('wedding_checklist').select('card_id, prazo, feito, marco').eq('org_id', orgId),
        sbAny.from('wedding_fornecedores').select('card_id, setor, status, valor').eq('org_id', orgId),
      ])

      const hotel: Record<string, { status: HotelStatus | null; tarifa: number | null; quartos: number | null }> = {}
      for (const r of (hotelRes.data ?? []) as { card_id: string; status: HotelStatus | null; tarifa: number | null; total_quartos: number | null }[]) {
        hotel[r.card_id] = { status: r.status ?? null, tarifa: r.tarifa ?? null, quartos: r.total_quartos ?? null }
      }

      const convites: Record<string, number> = {}
      for (const r of (convitesRes.data ?? []) as { card_id: string }[]) {
        convites[r.card_id] = (convites[r.card_id] ?? 0) + 1
      }

      const hoje = new Date().toISOString().slice(0, 10)
      const checklist: Record<string, PlanejamentoChecklistResumo> = {}
      const tasks: Record<string, GateTask[]> = {}
      for (const r of (checklistRes.data ?? []) as { card_id: string; prazo: string | null; feito: boolean; marco: string | null }[]) {
        const c = checklist[r.card_id] ?? { total: 0, feitos: 0, comPrazo: 0, atrasados: 0, pendentes: 0 }
        c.total += 1
        if (r.feito) c.feitos += 1
        else {
          c.pendentes += 1
          if (r.prazo && r.prazo < hoje) c.atrasados += 1
        }
        if (r.prazo) c.comPrazo += 1
        checklist[r.card_id] = c
        ;(tasks[r.card_id] ??= []).push({ marco: r.marco ?? null, feito: r.feito })
      }

      const fornecedores: Record<string, PlanejamentoFornecedor[]> = {}
      for (const r of (fornRes.data ?? []) as { card_id: string; setor: string; status: FornecedorStatus; valor: number | null }[]) {
        const list = fornecedores[r.card_id] ?? []
        list.push({ setor: r.setor, status: r.status, valor: r.valor ?? null })
        fornecedores[r.card_id] = list
      }

      return { hotel, convites, checklist, fornecedores, tasks } as GateData
    },
  })

  const data = useMemo<WeddingPlanejamento[]>(() => {
    const weddings: WeddingWithGuests[] = base.data ?? []
    const stageMap = stagesQuery.data ?? {}
    const stateMap = stateQuery.data ?? {}
    const gd: GateData = gateDataQuery.data ?? { hotel: {}, convites: {}, checklist: {}, fornecedores: {}, tasks: {} }

    return weddings.map(w => {
      const planejamentoEtapa = displayedEtapaPlanejamento(
        stateMap[w.id],
        w.pipeline_stage_id ? stageMap[w.pipeline_stage_id] : null,
      )
      const hotel = gd.hotel[w.id] ?? { status: null, tarifa: null, quartos: null }
      const convitesCount = gd.convites[w.id] ?? 0
      const checklist = gd.checklist[w.id] ?? { total: 0, feitos: 0, comPrazo: 0, atrasados: 0, pendentes: 0 }
      const fornecedores = gd.fornecedores[w.id] ?? []
      const marcosFeitos = Array.isArray(w.produto_data?.[PLANEJ_FIELD.marcosFeitos])
        ? (w.produto_data![PLANEJ_FIELD.marcosFeitos] as unknown[]).filter((x): x is string => typeof x === 'string')
        : []

      const gate = computeGate(planejamentoEtapa, {
        produtoData: w.produto_data,
        weddingDate: w.wedding_date,
        guestTotal: w.counts.total,
        guestConfirmado: w.counts.confirmado,
        hotelStatus: hotel.status,
        hotelQuartos: hotel.quartos,
        convitesCount,
        checklistComPrazo: checklist.comPrazo,
        fornecedores: fornecedores.map(f => ({ setor: f.setor, status: f.status })),
        marcosFeitos,
        tasks: gd.tasks[w.id] ?? [],
      })

      return {
        ...w,
        planejamentoEtapa,
        gate,
        hotelStatus: hotel.status,
        hotelTarifa: hotel.tarifa,
        hotelQuartos: hotel.quartos,
        convitesCount,
        fornecedores,
        checklist,
      }
    })
  }, [base.data, stagesQuery.data, stateQuery.data, gateDataQuery.data])

  return {
    data,
    isLoading: base.isLoading || stagesQuery.isLoading,
    isError: base.isError,
    error: base.error,
  }
}

interface GateData {
  hotel: Record<string, { status: HotelStatus | null; tarifa: number | null; quartos: number | null }>
  convites: Record<string, number>
  checklist: Record<string, PlanejamentoChecklistResumo>
  fornecedores: Record<string, PlanejamentoFornecedor[]>
  tasks: Record<string, GateTask[]>
}
