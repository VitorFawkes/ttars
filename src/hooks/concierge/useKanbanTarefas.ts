import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem, TipoConcierge, SourceConcierge } from './types'

export type EstadoFunil = 'a_fazer' | 'em_contato' | 'aceito' | 'feito' | 'encerrado'

export interface KanbanTarefasFilters {
  donoId?: string | null
  tipos?: TipoConcierge[]
  sources?: SourceConcierge[]
}

export interface KanbanTarefaItem extends MeuDiaItem {
  estado_funil: EstadoFunil
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
  const query = useQuery({
    queryKey: ['concierge', 'kanban-tarefas', filters],
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
      }))
    },
    staleTime: 30 * 1000,
  })

  const groupedByEstado = useMemo(() => {
    const groups = new Map<EstadoFunil, KanbanTarefaItem[]>()
    for (const col of ESTADO_FUNIL_COLUMNS) groups.set(col.id, [])
    for (const item of query.data ?? []) {
      groups.get(item.estado_funil)!.push(item)
    }
    return groups
  }, [query.data])

  return { ...query, groupedByEstado }
}
