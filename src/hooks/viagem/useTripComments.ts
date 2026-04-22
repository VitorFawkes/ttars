import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface TripCommentInterno {
  id: string
  viagem_id: string
  item_id: string | null
  autor: 'client' | 'tp' | 'pv'
  autor_id: string | null
  texto: string
  interno: boolean
  created_at: string
}

export const tripCommentsKeys = {
  all: ['trip-comments'] as const,
  byViagem: (viagemId: string) => ['trip-comments', viagemId] as const,
}

function papelFromPhase(phaseSlug: string | null | undefined): 'tp' | 'pv' {
  return phaseSlug === 'pos_venda' ? 'pv' : 'tp'
}

export function useTripComments(viagemId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: viagemId ? tripCommentsKeys.byViagem(viagemId) : ['trip-comments', 'none'],
    queryFn: async (): Promise<TripCommentInterno[]> => {
      if (!viagemId) return []
      const { data, error } = await supabase
        .from('trip_comments')
        .select('*')
        .eq('viagem_id', viagemId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as TripCommentInterno[]
    },
    enabled: !!viagemId,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!viagemId) return
    const channel = supabase
      .channel(`trip-comments-${viagemId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_comments',
        filter: `viagem_id=eq.${viagemId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: tripCommentsKeys.byViagem(viagemId) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [viagemId, queryClient])

  return query
}

interface CreateCommentInput {
  viagem_id: string
  item_id: string | null
  texto: string
  interno?: boolean
}

export function useCreateTripComment() {
  const queryClient = useQueryClient()
  const { user, profile } = useAuth()
  const papel = papelFromPhase(profile?.team?.phase?.slug)

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('trip_comments') as any)
        .insert({
          viagem_id: input.viagem_id,
          item_id: input.item_id,
          texto: input.texto,
          interno: input.interno ?? false,
          autor: papel,
          autor_id: user?.id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as TripCommentInterno
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tripCommentsKeys.byViagem(data.viagem_id) })
    },
  })
}

export function useDeleteTripComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; viagem_id: string }) => {
      const { error } = await supabase
        .from('trip_comments')
        .delete()
        .eq('id', input.id)
      if (error) throw error
      return input
    },
    onSuccess: (input) => {
      queryClient.invalidateQueries({ queryKey: tripCommentsKeys.byViagem(input.viagem_id) })
    },
  })
}
