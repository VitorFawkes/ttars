import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { viagemKeys } from './useViagem'

// RPCs do Marco 1 ainda não estão em database.types.ts — cast necessário
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any

export function useViagemMutations(token: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    if (token) {
      queryClient.invalidateQueries({ queryKey: viagemKeys.byToken(token) })
    }
  }

  const aprovarItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await rpc('aprovar_item', {
        p_token: token!,
        p_item_id: itemId,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const escolherAlternativa = useMutation({
    mutationFn: async ({
      itemId,
      alternativaId,
    }: {
      itemId: string
      alternativaId: string
    }) => {
      const { data, error } = await rpc('escolher_alternativa', {
        p_token: token!,
        p_item_id: itemId,
        p_alternativa_id: alternativaId,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const comentar = useMutation({
    mutationFn: async ({
      itemId,
      texto,
    }: {
      itemId: string | null
      texto: string
    }) => {
      const { data, error } = await rpc('comentar_item', {
        p_token: token!,
        p_item_id: itemId,
        p_texto: texto,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const confirmarViagem = useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc('confirmar_viagem', {
        p_token: token!,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const registrarNps = useMutation({
    mutationFn: async ({ nota, comentario }: { nota: number; comentario?: string }) => {
      const { data, error } = await rpc('registrar_nps', {
        p_token: token!,
        p_nota: nota,
        p_comentario: comentario ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return {
    aprovarItem,
    escolherAlternativa,
    comentar,
    confirmarViagem,
    registrarNps,
  }
}
