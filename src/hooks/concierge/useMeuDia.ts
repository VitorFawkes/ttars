import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem, StatusApresentacao, TipoConcierge, SourceConcierge } from './types'

export interface MeuDiaFilters {
  donoId?: string | null
  status?: ('aberto' | 'em_andamento' | 'concluido')[]
  tipos?: TipoConcierge[]
  categorias?: string[]
  sources?: SourceConcierge[]
  cardId?: string | null
  diasPraEmbarqueMin?: number | null
  diasPraEmbarqueMax?: number | null
  incluirConcluidos?: boolean
}

export type MeuDiaGroupBy = 'prazo' | 'viagem' | 'categoria'

export function useMeuDia(filters: MeuDiaFilters = {}) {
  const incluirConcluidos = filters.incluirConcluidos ?? false

  return useQuery({
    queryKey: ['concierge', 'meu-dia', filters],
    queryFn: async (): Promise<MeuDiaItem[]> => {
      let query = sbAny
        .from('v_meu_dia_concierge')
        .select('*')

      if (filters.donoId) query = query.eq('dono_id', filters.donoId)
      if (filters.cardId) query = query.eq('card_id', filters.cardId)
      if (filters.tipos && filters.tipos.length) query = query.in('tipo_concierge', filters.tipos)
      if (filters.categorias && filters.categorias.length) query = query.in('categoria', filters.categorias)
      if (filters.sources && filters.sources.length) query = query.in('source', filters.sources)

      if (!incluirConcluidos) {
        query = query.eq('concluida', false)
      }

      query = query.order('concluida', { ascending: true })
      query = query.order('data_vencimento', { ascending: true, nullsFirst: false })

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as MeuDiaItem[]
    },
    staleTime: 30 * 1000,
  })
}

interface MeuDiaGrouped {
  groupKey: string
  groupLabel: string
  groupOrder: number
  items: MeuDiaItem[]
}

export function useGroupedMeuDia(items: MeuDiaItem[], groupBy: MeuDiaGroupBy): MeuDiaGrouped[] {
  return useMemo(() => {
    const groups = new Map<string, MeuDiaGrouped>()

    if (groupBy === 'prazo') {
      const ordemStatus: Record<StatusApresentacao, number> = {
        vencido: 0,
        hoje: 1,
        esta_semana: 2,
        futuro: 3,
        fechado: 4,
        concluido: 5,
      }
      const labelStatus: Record<StatusApresentacao, string> = {
        vencido: 'Vencidos',
        hoje: 'Hoje',
        esta_semana: 'Esta semana',
        futuro: 'Próximas',
        fechado: 'Fechados',
        concluido: 'Concluídos',
      }
      for (const item of items) {
        const k = item.status_apresentacao
        if (!groups.has(k)) {
          groups.set(k, {
            groupKey: k,
            groupLabel: labelStatus[k],
            groupOrder: ordemStatus[k],
            items: [],
          })
        }
        groups.get(k)!.items.push(item)
      }
    } else if (groupBy === 'viagem') {
      for (const item of items) {
        const k = item.card_id
        if (!groups.has(k)) {
          groups.set(k, {
            groupKey: k,
            groupLabel: item.card_titulo,
            groupOrder: item.data_viagem_inicio
              ? new Date(item.data_viagem_inicio).getTime()
              : Number.MAX_SAFE_INTEGER,
            items: [],
          })
        }
        groups.get(k)!.items.push(item)
      }
    } else if (groupBy === 'categoria') {
      for (const item of items) {
        const k = item.categoria
        if (!groups.has(k)) {
          groups.set(k, {
            groupKey: k,
            groupLabel: item.categoria,
            groupOrder: 0,
            items: [],
          })
        }
        groups.get(k)!.items.push(item)
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.groupOrder - b.groupOrder)
  }, [items, groupBy])
}
