import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { FornecedorBankEntry } from './types'

// Banco de fornecedores — tabela fornecedor_bank (catálogo per-workspace,
// reutilizável entre casamentos). org_id via DEFAULT requesting_org_id();
// RLS isola por workspace. Queries filtram org_id.

export function useFornecedorBank() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<FornecedorBankEntry[]>({
    queryKey: ['fornecedor-bank', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await sbAny
        .from('fornecedor_bank')
        .select('id, nome, setor, localizacao, contato, valor, observacoes')
        .eq('org_id', orgId)
        .order('nome', { ascending: true })
      if (error) throw error
      return (data ?? []) as FornecedorBankEntry[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fornecedor-bank'] })

  const add = useMutation<void, Error, Omit<FornecedorBankEntry, 'id'>>({
    mutationFn: async (input) => {
      const { error } = await sbAny.from('fornecedor_bank').insert(input)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor salvo no banco.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await sbAny.from('fornecedor_bank').delete().eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor removido do banco.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const update = useMutation<void, Error, FornecedorBankEntry>({
    mutationFn: async (entry) => {
      const { id, ...rest } = entry
      const { error } = await sbAny.from('fornecedor_bank').update(rest).eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor atualizado no banco.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  return {
    bank: query.data ?? [],
    isLoading: query.isLoading,
    add,
    remove,
    update,
  }
}
