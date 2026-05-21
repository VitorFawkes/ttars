import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import { STATUS_RSVP_LABEL, type StatusRSVP } from './types'

interface Input {
  id: string
  status_rsvp: StatusRSVP
}

/** Mutation enxuta só para mudar status_rsvp via botões de ação rápida da
 *  tabela (✓ confirmar, ✗ recusar, 👤- remover). */
export function useUpdateGuestStatus() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, Input>({
    mutationFn: async ({ id, status_rsvp }) => {
      const { error } = await sbAny
        .from('wedding_guests')
        .update({ status_rsvp })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['convidados'] })
      toast.success(`Status: ${STATUS_RSVP_LABEL[vars.status_rsvp]}`)
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar: ${err.message}`)
    },
  })
}
