import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Viagem, TripItem, DayGroupData } from '@/types/viagem'

export const viagemKeys = {
  all: ['viagem'] as const,
  byToken: (token: string) => ['viagem', token] as const,
}

function groupItemsByDay(items: TripItem[]): {
  days: DayGroupData[]
  orphans: TripItem[]
} {
  const dayItems = items.filter((i) => i.tipo === 'dia')
  const nonDayItems = items.filter((i) => i.tipo !== 'dia')

  const days: DayGroupData[] = dayItems
    .sort((a, b) => a.ordem - b.ordem)
    .map((day) => ({
      day,
      children: nonDayItems
        .filter((i) => i.parent_id === day.id)
        .sort((a, b) => a.ordem - b.ordem),
    }))

  const parentIds = new Set(dayItems.map((d) => d.id))
  const orphans = nonDayItems
    .filter((i) => !i.parent_id || !parentIds.has(i.parent_id))
    .sort((a, b) => a.ordem - b.ordem)

  return { days, orphans }
}

export function useViagem(token: string | undefined) {
  const queryClient = useQueryClient()
  const viagemIdRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: viagemKeys.byToken(token ?? ''),
    queryFn: async () => {
      // RPCs do Marco 1 ainda não estão em database.types.ts — cast necessário
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_viagem_by_token', {
        p_token: token!,
      })
      if (error) throw error
      return data as unknown as Viagem
    },
    enabled: !!token,
    staleTime: 30_000,
  })

  // Track viagemId for Realtime
  useEffect(() => {
    if (query.data?.id) {
      viagemIdRef.current = query.data.id
    }
  }, [query.data?.id])

  // Realtime: invalidate on viagem/item changes
  useEffect(() => {
    if (!query.data?.id) return

    const viagemId = query.data.id
    const channel = supabase
      .channel(`viagem-client-${viagemId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'viagens',
          filter: `id=eq.${viagemId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: viagemKeys.byToken(token!) })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_items',
          filter: `viagem_id=eq.${viagemId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: viagemKeys.byToken(token!) })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_comments',
          filter: `viagem_id=eq.${viagemId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: viagemKeys.byToken(token!) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [query.data?.id, token, queryClient])

  const viagem = query.data ?? null
  const { days, orphans } = viagem
    ? groupItemsByDay(viagem.items)
    : { days: [], orphans: [] }

  return {
    viagem,
    days,
    orphans,
    comments: viagem?.comments ?? [],
    events: viagem?.events ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
