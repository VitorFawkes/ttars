import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sbAny } from '../_supabaseUntyped'
import { phoneDigits } from '../../../lib/convidados/formatPhoneBR'

interface CreateCasalInput {
  nome_casal: string
  whatsapp: string
  codigo: string
  card_id?: string | null
}

export function useCreateCasal() {
  const qc = useQueryClient()
  return useMutation<string, Error, CreateCasalInput>({
    mutationFn: async (input) => {
      const { data, error } = await sbAny.rpc('wedding_casal_admin_create', {
        p_nome_casal: input.nome_casal,
        p_whatsapp_digits: phoneDigits(input.whatsapp),
        p_codigo: input.codigo.toUpperCase(),
        p_card_id: input.card_id || null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais', 'admin'] }),
  })
}

export function useUpdateCasal() {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    { casal_id: string; nome_casal?: string; whatsapp?: string }
  >({
    mutationFn: async ({ casal_id, nome_casal, whatsapp }) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_update', {
        p_casal_id: casal_id,
        p_nome_casal: nome_casal || null,
        p_whatsapp_digits: whatsapp ? phoneDigits(whatsapp) : null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais', 'admin'] }),
  })
}

export function useDeleteCasal() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (casal_id) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_delete', {
        p_casal_id: casal_id,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais', 'admin'] }),
  })
}

export function useEncerrarCasal() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (casal_id) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_encerrar', {
        p_casal_id: casal_id,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais', 'admin'] }),
  })
}

export function useVincularCasalAoCard() {
  const qc = useQueryClient()
  return useMutation<void, Error, { casal_id: string; card_id: string }>({
    mutationFn: async ({ casal_id, card_id }) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_vincular_card', {
        p_casal_id: casal_id,
        p_card_id: card_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['casais'] })
      qc.invalidateQueries({ queryKey: ['convidados'] })
    },
  })
}

export function useDesvincularCasalDoCard() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (casal_id) => {
      const { error } = await sbAny.rpc('wedding_casal_admin_desvincular_card', {
        p_casal_id: casal_id,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casais'] }),
  })
}
