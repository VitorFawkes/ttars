import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { HospedagemBloco, HospedagemStatus } from './types'

// Hospedagem por casamento — tabela wedding_hospedagem (per-org, FK ao card).
// org_id forçado pelo trigger strict a partir de cards.org_id; RLS isola por
// workspace. Queries filtram org_id + card_id.

const COLS = 'id, hotel, contato, localizacao, check_in, check_out, quartos, hospedes_alocados, tarifa, status, observacoes'

export function useWeddingHospedagem(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<HospedagemBloco[]>({
    queryKey: ['planejamento', 'hospedagem', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('wedding_hospedagem')
        .select(COLS)
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .order('status', { ascending: true })
        .order('check_in', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as HospedagemBloco[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['planejamento', 'hospedagem'] })

  const add = useMutation<void, Error, Omit<HospedagemBloco, 'id'>>({
    mutationFn: async (input) => {
      const { error } = await sbAny.from('wedding_hospedagem').insert({ card_id: cardId, ...input })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Hospedagem adicionada.')
    },
    onError: (err) => toast.error(`Não consegui adicionar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await sbAny.from('wedding_hospedagem').delete().eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Hospedagem removida.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const update = useMutation<void, Error, HospedagemBloco>({
    mutationFn: async (bloco) => {
      const { id, ...rest } = bloco
      const { error } = await sbAny.from('wedding_hospedagem').update(rest).eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Hospedagem atualizada.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  const setStatus = useMutation<void, Error, { id: string; status: HospedagemStatus }>({
    mutationFn: async ({ id, status }) => {
      const { error } = await sbAny
        .from('wedding_hospedagem')
        .update({ status })
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (err) => toast.error(`Não consegui atualizar: ${err.message}`),
  })

  return {
    blocos: query.data ?? [],
    isLoading: query.isLoading,
    add,
    remove,
    update,
    setStatus,
  }
}
