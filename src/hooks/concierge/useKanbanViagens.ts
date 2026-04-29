import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import { usePipelineStages } from '../usePipelineStages'
import type { MeuDiaItem, TipoConcierge } from './types'

/**
 * Saúde da viagem permanece como sinal visual no card (cor da accent bar),
 * mas o agrupamento no Kanban-por-viagem agora é por etapa do pipeline.
 */
export type SaudeViagem = 'critica' | 'em_andamento' | 'concluida'

export interface KanbanViagensFilters {
  donoId?: string | null
  tipos?: TipoConcierge[]
  pipelineId?: string | null
}

export interface ViagemKanbanItem {
  card_id: string
  card_titulo: string
  produto: string
  data_viagem_inicio: string | null
  data_viagem_fim: string | null
  pessoa_principal_id: string | null
  card_valor_estimado: number | null
  card_valor_final: number | null
  pipeline_stage_id: string
  saude: SaudeViagem
  total_atendimentos: number
  abertos_count: number
  vencidos: number
  hoje: number
  esta_semana: number
  concluidos: number
  proxima_data_vencimento: string | null
  dias_pra_embarque: number | null
  tipos_pendentes: TipoConcierge[]
  abertos: MeuDiaItem[]
}

export interface StageColumnSpec {
  id: string
  label: string
  hint?: string
  phase: string | null
  tone: { bg: string; text: string; border: string; accent: string }
}

/** Cores da accent bar conforme a fase do pipeline */
const PHASE_TONE: Record<string, StageColumnSpec['tone']> = {
  planner:    { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     accent: 'bg-sky-500'     },
  pos_venda:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'bg-emerald-500' },
  entrega:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: 'bg-amber-500'   },
  resolucao:  { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   accent: 'bg-slate-400'   },
}
const DEFAULT_TONE: StageColumnSpec['tone'] = { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', accent: 'bg-slate-400' }

function classifySaude(viagem: {
  abertos_count: number
  vencidos: number
  dias_pra_embarque: number | null
}): SaudeViagem {
  if (viagem.abertos_count === 0) return 'concluida'
  if (viagem.vencidos > 0) return 'critica'
  if (viagem.dias_pra_embarque !== null && viagem.dias_pra_embarque >= 0 && viagem.dias_pra_embarque <= 2) return 'critica'
  return 'em_andamento'
}

function isAberto(item: MeuDiaItem) {
  return !item.outcome && !item.concluida
}

export function useKanbanViagens(filters: KanbanViagensFilters = {}) {
  const stagesQuery = usePipelineStages(filters.pipelineId ?? undefined)

  const query = useQuery({
    queryKey: ['concierge', 'kanban-viagens', { donoId: filters.donoId, tipos: filters.tipos }],
    queryFn: async (): Promise<ViagemKanbanItem[]> => {
      let q = sbAny.from('v_meu_dia_concierge').select('*')

      if (filters.donoId) q = q.eq('dono_id', filters.donoId)
      if (filters.tipos?.length) q = q.in('tipo_concierge', filters.tipos)

      const { data, error } = await q
      if (error) throw error

      const byCard = new Map<string, MeuDiaItem[]>()
      for (const item of (data ?? []) as MeuDiaItem[]) {
        const list = byCard.get(item.card_id) ?? []
        list.push(item)
        byCard.set(item.card_id, list)
      }

      const result: ViagemKanbanItem[] = []
      for (const [card_id, items] of byCard.entries()) {
        const head = items[0]
        const abertos = items
          .filter(isAberto)
          .sort((a, b) => {
            const da = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Number.MAX_SAFE_INTEGER
            const db = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Number.MAX_SAFE_INTEGER
            return da - db
          })
        const vencidos = abertos.filter(i => i.status_apresentacao === 'vencido').length
        const hoje = abertos.filter(i => i.status_apresentacao === 'hoje').length
        const esta_semana = abertos.filter(i => i.status_apresentacao === 'esta_semana').length
        const concluidos = items.filter(i => i.outcome === 'feito' || i.outcome === 'aceito' || i.concluida).length

        const proximaData = abertos
          .map(i => i.data_vencimento)
          .filter((d): d is string => !!d)[0] ?? null

        const tiposSet = new Set<TipoConcierge>()
        for (const i of abertos) tiposSet.add(i.tipo_concierge)

        const base = {
          card_id,
          card_titulo: head.card_titulo,
          produto: head.produto,
          data_viagem_inicio: head.data_viagem_inicio,
          data_viagem_fim: head.data_viagem_fim,
          pessoa_principal_id: head.pessoa_principal_id,
          card_valor_estimado: head.card_valor_estimado,
          card_valor_final: head.card_valor_final,
          pipeline_stage_id: head.pipeline_stage_id,
          total_atendimentos: items.length,
          abertos_count: abertos.length,
          vencidos,
          hoje,
          esta_semana,
          concluidos,
          proxima_data_vencimento: proximaData,
          dias_pra_embarque: head.dias_pra_embarque,
          tipos_pendentes: Array.from(tiposSet),
          abertos,
        }

        result.push({
          ...base,
          saude: classifySaude(base),
        })
      }

      return result
    },
    staleTime: 30 * 1000,
  })

  const stageColumns = useMemo<StageColumnSpec[]>(() => {
    const stages = stagesQuery.data ?? []
    return stages.map(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stage = s as any
      const phaseSlug: string | null = stage.pipeline_phases?.slug ?? null
      const tone = phaseSlug && PHASE_TONE[phaseSlug] ? PHASE_TONE[phaseSlug] : DEFAULT_TONE
      return {
        id: stage.id,
        label: stage.nome ?? stage.name ?? 'Etapa',
        phase: phaseSlug,
        tone,
      }
    })
  }, [stagesQuery.data])

  const groupedByStage = useMemo(() => {
    const groups = new Map<string, ViagemKanbanItem[]>()
    for (const col of stageColumns) groups.set(col.id, [])
    for (const v of query.data ?? []) {
      const arr = groups.get(v.pipeline_stage_id)
      if (arr) {
        arr.push(v)
      } else {
        // Etapa não está no pipeline atual (raro: viagem de outro produto/pipeline) — agrupa em "_outras"
        const others = groups.get('_outras') ?? []
        others.push(v)
        groups.set('_outras', others)
      }
    }
    // Ordenar viagens dentro de cada coluna por dias pra embarque (próximas primeiro)
    for (const [, viagens] of groups) {
      viagens.sort((a, b) => {
        const da = a.dias_pra_embarque ?? Number.MAX_SAFE_INTEGER
        const db = b.dias_pra_embarque ?? Number.MAX_SAFE_INTEGER
        return da - db
      })
    }
    return groups
  }, [query.data, stageColumns])

  /** Retorna apenas as colunas (etapas) que têm viagens — esconde etapas vazias */
  const visibleColumns = useMemo<StageColumnSpec[]>(() => {
    return stageColumns.filter(c => (groupedByStage.get(c.id)?.length ?? 0) > 0)
  }, [stageColumns, groupedByStage])

  return {
    ...query,
    isLoading: query.isLoading || stagesQuery.isLoading,
    groupedByStage,
    stageColumns,
    visibleColumns,
  }
}
