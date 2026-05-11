import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface TripItemHistoryRow {
  id: string
  item_id: string
  viagem_id: string
  autor: string | null
  papel: 'tp' | 'pv' | 'sistema' | 'client' | null
  campo: string
  valor_anterior: unknown
  valor_novo: unknown
  created_at: string
  autor_nome: string | null
  autor_avatar: string | null
}

export const tripItemHistoryKeys = {
  all: ['trip-item-history'] as const,
  byItem: (itemId: string) => ['trip-item-history', itemId] as const,
}

export function useTripItemHistory(itemId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: itemId ? tripItemHistoryKeys.byItem(itemId) : ['trip-item-history', 'none'],
    queryFn: async (): Promise<TripItemHistoryRow[]> => {
      if (!itemId) return []
      const { data, error } = await supabase
        .from('trip_item_history')
        .select('*, profile:autor(nome, avatar_url)')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      type Row = {
        id: string
        item_id: string
        viagem_id: string
        autor: string | null
        papel: TripItemHistoryRow['papel']
        campo: string
        valor_anterior: unknown
        valor_novo: unknown
        created_at: string
        profile: { nome: string | null; avatar_url: string | null } | null
      }
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        item_id: r.item_id,
        viagem_id: r.viagem_id,
        autor: r.autor,
        papel: r.papel,
        campo: r.campo,
        valor_anterior: r.valor_anterior,
        valor_novo: r.valor_novo,
        created_at: r.created_at,
        autor_nome: r.profile?.nome ?? null,
        autor_avatar: r.profile?.avatar_url ?? null,
      }))
    },
    enabled: !!itemId,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!itemId) return
    const channel = supabase
      .channel(`trip-item-history-${itemId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trip_item_history',
        filter: `item_id=eq.${itemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: tripItemHistoryKeys.byItem(itemId) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [itemId, queryClient])

  return query
}
