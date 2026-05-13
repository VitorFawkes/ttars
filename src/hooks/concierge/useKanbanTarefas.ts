import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem, TipoConcierge, SourceConcierge } from './types'

export type EstadoFunil =
  | 'agendado_futuro'
  | 'aguardando_atendimento'
  | 'em_contato'
  | 'aguardando_retorno'
  | 'feito'
  | 'encerrado'

export type JanelaEmbarque =
  | 'sem_data'
  | 'em_viagem'
  | 'embarca_48h'
  | 'embarca_semana'
  | 'embarca_15d'
  | 'embarca_30d'
  | 'embarca_futuro'

export const JANELA_LABEL: Record<JanelaEmbarque, string> = {
  sem_data:        'Sem data',
  em_viagem:       'Em viagem',
  embarca_48h:     '48h',
  embarca_semana:  'Esta semana',
  embarca_15d:     '15 dias',
  embarca_30d:     '30 dias',
  embarca_futuro:  '30+ dias',
}

export const JANELA_ORDER: JanelaEmbarque[] = [
  'em_viagem',
  'embarca_48h',
  'embarca_semana',
  'embarca_15d',
  'embarca_30d',
  'embarca_futuro',
  'sem_data',
]

export function computeJanelaEmbarque(dias: number | null): JanelaEmbarque {
  if (dias === null || dias === undefined) return 'sem_data'
  if (dias < 0) return 'em_viagem'
  if (dias <= 2) return 'embarca_48h'
  if (dias <= 7) return 'embarca_semana'
  if (dias <= 15) return 'embarca_15d'
  if (dias <= 30) return 'embarca_30d'
  return 'embarca_futuro'
}

export interface KanbanTarefasFilters {
  donoId?: string | null
  tipos?: TipoConcierge[]
  sources?: SourceConcierge[]
  cardIds?: string[]
  janelas?: JanelaEmbarque[]
  categorias?: string[]
  /** Map<cardId, Set<tagId>> + lista de tagIds desejadas — filtra cards que tem qualquer uma das tags */
  tagFilter?: { tagIds: string[]; lookup: Map<string, Set<string>> }
  search?: string
  /** Quando false, esconde atendimentos com outcome (Feito/Encerrado) com
   *  outcome_em há mais de 2 dias. Default: false (esconder). */
  mostrarConcluidosAntigos?: boolean
}

export interface KanbanTarefaItem extends MeuDiaItem {
  estado_funil: EstadoFunil
  janela_embarque: JanelaEmbarque
}

export interface KanbanColumnSpec {
  id: EstadoFunil
  label: string
  hint: string
  tone: { bg: string; text: string; border: string; accent: string }
}

export const ESTADO_FUNIL_COLUMNS: KanbanColumnSpec[] = [
  { id: 'agendado_futuro',        label: 'Agendados para o futuro', hint: 'Estocados manualmente — voltam quando você arrastar de volta', tone: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  accent: 'bg-violet-400'  } },
  { id: 'aguardando_atendimento', label: 'Aguardando atendimento', hint: 'Não iniciado ainda',           tone: { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   accent: 'bg-slate-300'   } },
  { id: 'em_contato',             label: 'Em contato',             hint: 'Você está cuidando agora',     tone: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    accent: 'bg-blue-500'    } },
  { id: 'aguardando_retorno',     label: 'Aguardando retorno',     hint: 'Esperando resposta do cliente',  tone: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: 'bg-amber-500'   } },
  { id: 'feito',                  label: 'Feito',                  hint: 'Atendimento concluído',        tone: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'bg-emerald-500' } },
  { id: 'encerrado',              label: 'Encerrado',              hint: 'Recusado ou cancelado',        tone: { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     accent: 'bg-red-500'     } },
]

export function computeEstadoFunil(item: MeuDiaItem): EstadoFunil {
  // Flag sticky: se o concierge estocou o atendimento na coluna Futuro, ele
  // fica lá indefinidamente — INDEPENDENTE de outcome/started_at/notificação.
  // Sair só por ação manual do concierge (drag pra outra coluna).
  if (item.concierge_em_futuro)                                       return 'agendado_futuro'
  // Outcome decide o destino — 'aceito' (legado, oferta aceita) entra junto com 'feito'.
  if (item.outcome === 'aceito' || item.outcome === 'feito')          return 'feito'
  if (item.outcome === 'recusado' || item.outcome === 'cancelado')    return 'encerrado'
  if (item.notificou_cliente_em)                                      return 'aguardando_retorno'
  if (item.started_at)                                                return 'em_contato'
  return 'aguardando_atendimento'
}

export function useKanbanTarefas(filters: KanbanTarefasFilters = {}) {
  const baseQuery = useQuery({
    queryKey: ['concierge', 'kanban-tarefas-base', { donoId: filters.donoId, tipos: filters.tipos, sources: filters.sources }],
    queryFn: async (): Promise<KanbanTarefaItem[]> => {
      let q = sbAny.from('v_meu_dia_concierge').select('*')

      if (filters.donoId) q = q.eq('dono_id', filters.donoId)
      if (filters.tipos?.length) q = q.in('tipo_concierge', filters.tipos)
      if (filters.sources?.length) q = q.in('source', filters.sources)

      q = q.order('data_vencimento', { ascending: true, nullsFirst: false })

      const { data, error } = await q
      if (error) throw error

      return ((data ?? []) as MeuDiaItem[]).map(item => ({
        ...item,
        estado_funil: computeEstadoFunil(item),
        janela_embarque: computeJanelaEmbarque(item.dias_pra_embarque),
      }))
    },
    staleTime: 30 * 1000,
  })

  const enriched = baseQuery.data

  const filtered = useMemo(() => {
    if (!enriched) return undefined
    const wantedTagIds = filters.tagFilter?.tagIds ?? []
    const tagLookup = filters.tagFilter?.lookup
    // Atendimentos com outcome há mais de 2 dias somem por padrão.
    // Defensivo: se outcome_em é null (raro), mantém visível.
    const limiteAntigo = filters.mostrarConcluidosAntigos
      ? null
      : Date.now() - 2 * 24 * 60 * 60 * 1000
    return enriched.filter(item => {
      // Filtros de "viagem" comparam contra root_card_id: o usuário pensa em
      // viagens (cards principais), não em sub-cards individuais.
      const rootId = item.root_card_id ?? item.card_id
      if (filters.cardIds?.length && !filters.cardIds.includes(rootId)) return false
      if (filters.janelas?.length && !filters.janelas.includes(item.janela_embarque)) return false
      if (filters.categorias?.length && !filters.categorias.includes(item.categoria)) return false
      if (wantedTagIds.length > 0 && tagLookup) {
        const cardTags = tagLookup.get(rootId)
        if (!cardTags) return false
        const intersects = wantedTagIds.some(t => cardTags.has(t))
        if (!intersects) return false
      }
      if (filters.search?.trim()) {
        const q = filters.search.toLowerCase()
        const tituloViagem = item.root_card_titulo ?? item.card_titulo
        const blob = `${item.titulo} ${tituloViagem} ${item.descricao ?? ''} ${item.categoria}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      if (limiteAntigo !== null && item.outcome && item.outcome_em) {
        if (new Date(item.outcome_em).getTime() < limiteAntigo) return false
      }
      return true
    })
  }, [enriched, filters.cardIds, filters.janelas, filters.categorias, filters.tagFilter, filters.search, filters.mostrarConcluidosAntigos])

  const groupedByEstado = useMemo(() => {
    const groups = new Map<EstadoFunil, KanbanTarefaItem[]>()
    for (const col of ESTADO_FUNIL_COLUMNS) groups.set(col.id, [])
    for (const item of filtered ?? []) {
      groups.get(item.estado_funil)!.push(item)
    }
    return groups
  }, [filtered])

  return {
    ...baseQuery,
    data: filtered,
    rawData: enriched,
    groupedByEstado,
  }
}
