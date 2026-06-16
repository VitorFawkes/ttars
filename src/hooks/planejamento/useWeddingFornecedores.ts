import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { Fornecedor, FornecedorStatus } from './types'

// Fornecedores por casamento — tabela wedding_fornecedores (per-org, FK ao card).
// org_id é forçado pelo trigger strict a partir de cards.org_id; RLS isola por
// workspace. As queries filtram org_id + card_id (defesa em profundidade).

export function useWeddingFornecedores(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<Fornecedor[]>({
    queryKey: ['planejamento', 'fornecedores', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('wedding_fornecedores')
        .select('id, setor, nome, contato, valor, status')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Fornecedor[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['planejamento', 'fornecedores'] })

  const add = useMutation<void, Error, Omit<Fornecedor, 'id'>>({
    mutationFn: async (input) => {
      const { error } = await sbAny.from('wedding_fornecedores').insert({ card_id: cardId, ...input })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor adicionado.')
    },
    onError: (err) => toast.error(`Não consegui adicionar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await sbAny.from('wedding_fornecedores').delete().eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor removido.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const setStatus = useMutation<void, Error, { id: string; status: FornecedorStatus }>({
    mutationFn: async ({ id, status }) => {
      const { error } = await sbAny
        .from('wedding_fornecedores')
        .update({ status })
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (err) => toast.error(`Não consegui mudar a fase: ${err.message}`),
  })

  const update = useMutation<void, Error, Fornecedor>({
    mutationFn: async (f) => {
      const { id, ...rest } = f
      const { error } = await sbAny
        .from('wedding_fornecedores')
        .update(rest)
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor atualizado.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  return {
    fornecedores: query.data ?? [],
    isLoading: query.isLoading,
    add,
    remove,
    setStatus,
    update,
  }
}
