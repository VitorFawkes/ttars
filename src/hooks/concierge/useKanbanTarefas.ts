import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem, TipoConcierge, SourceConcierge } from './types'

export type EstadoFunil = 'a_fazer' | 'em_contato' | 'aceito' | 'feito' | 'encerrado'

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
  { id: 'a_fazer',    label: 'A fazer',    hint: 'Sem contato com cliente ainda',  tone: { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200',   accent: 'bg-slate-400'   } },
  { id: 'em_contato', label: 'Em contato', hint: 'Cliente foi notificado',          tone: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: 'bg-amber-500'   } },
  { id: 'aceito',     label: 'Aceito',     hint: 'Oferta aceita pelo cliente',      tone: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  accent: 'bg-purple-500'  } },
  { id: 'feito',      label: 'Feito',      hint: 'Atendimento concluído',           tone: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'bg-emerald-500' } },
  { id: 'encerrado',  label: 'Encerrado',  hint: 'Recusado ou cancelado',           tone: { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     accent: 'bg-red-500'     } },
]

export function computeEstadoFunil(item: MeuDiaItem): EstadoFunil {
  if (item.outcome === 'aceito')                              return 'aceito'
  if (item.outcome === 'feito')                               return 'feito'
  if (item.outcome === 'recusado' || item.outcome === 'cancelado') return 'encerrado'
  if (item.notificou_cliente_em)                              return 'em_contato'
  return 'a_fazer'
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

  const filtered = useMemo(() => {
    if (!baseQuery.data) return undefined
    const wantedTagIds = filters.tagFilter?.tagIds ?? []
    const tagLookup = filters.tagFilter?.lookup
    return baseQuery.data.filter(item => {
      if (filters.cardIds?.length && !filters.cardIds.includes(item.card_id)) return false
      if (filters.janelas?.length && !filters.janelas.includes(item.janela_embarque)) return false
      if (filters.categorias?.length && !filters.categorias.includes(item.categoria)) return false
      if (wantedTagIds.length > 0 && tagLookup) {
        const cardTags = tagLookup.get(item.card_id)
        if (!cardTags) return false
        const intersects = wantedTagIds.some(t => cardTags.has(t))
        if (!intersects) return false
      }
      if (filters.search?.trim()) {
        const q = filters.search.toLowerCase()
        const blob = `${item.titulo} ${item.card_titulo} ${item.descricao ?? ''} ${item.categoria}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [baseQuery.data, filters.cardIds, filters.janelas, filters.categorias, filters.tagFilter, filters.search])

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
    rawData: baseQuery.data,
    groupedByEstado,
  }
}
