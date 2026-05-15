import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { sbAny } from './_supabaseUntyped'
import { ETAPA_LABEL, type EtapaConvidados } from './types'

interface UpdateEtapaInput {
  cardId: string
  etapa: EtapaConvidados
}

export function useUpdateWeddingEtapa() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation<void, Error, UpdateEtapaInput>({
    mutationFn: async ({ cardId, etapa }) => {
      const { error } = await sbAny
        .from('wedding_convidados_state')
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['convidados'] })
      toast.success(`Etapa: ${ETAPA_LABEL[vars.etapa]}`)
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar a etapa: ${err.message}`)
    },
  })
}
