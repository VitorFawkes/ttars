import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { PLANEJAMENTO_LABEL, type EtapaPlanejamento } from './types'

interface UpdatePlanejamentoInput {
  cardId: string
  etapa: EtapaPlanejamento
}

export function useUpdatePlanejamentoEtapa() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation<void, Error, UpdatePlanejamentoInput, { previous: [readonly unknown[], unknown][] }>({
    mutationFn: async ({ cardId, etapa }) => {
      const { error } = await sbAny
        .from('wedding_planejamento_state')
        .upsert(
          {
            card_id: cardId,
            etapa,
            updated_by: profile?.id ?? null,
          },
          { onConflict: 'card_id' },
        )
      if (error) throw error
    },
    // Otimista: move o card de coluna na hora, atualizando o mapa de overrides.
    onMutate: async ({ cardId, etapa }) => {
      await queryClient.cancelQueries({ queryKey: ['planejamento', 'state'] })
      const previous = queryClient.getQueriesData({ queryKey: ['planejamento', 'state'] })
      queryClient.setQueriesData(
        { queryKey: ['planejamento', 'state'] },
        (old: unknown) => ({ ...(old as Record<string, EtapaPlanejamento>), [cardId]: etapa }),
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      // Reverte o otimismo.
      for (const [key, value] of ctx?.previous ?? []) {
        queryClient.setQueryData(key, value)
      }
      toast.error(`Não consegui atualizar a etapa: ${err.message}`)
    },
    onSuccess: (_, vars) => {
      toast.success(`Etapa: ${PLANEJAMENTO_LABEL[vars.etapa]}`)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planejamento'] })
    },
  })
}
