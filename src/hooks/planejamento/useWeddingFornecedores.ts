import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { Fornecedor, FornecedorStatus } from './types'

// Fornecedores ficam (interim/WIP) em cards.produto_data.ww_fornecedores —
// mesmo padrão de merge do useUpdateWedding, sem migration nova. Quando o
// modelo solidificar, trocar por uma tabela wedding_fornecedores.

function readList(produtoData: unknown): Fornecedor[] {
  if (!produtoData || typeof produtoData !== 'object') return []
  const arr = (produtoData as Record<string, unknown>)['ww_fornecedores']
  return Array.isArray(arr) ? (arr as Fornecedor[]) : []
}

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
        .from('cards')
        .select('produto_data')
        .eq('id', cardId)
        .eq('org_id', orgId)
        .maybeSingle()
      if (error) throw error
      return readList(data?.produto_data)
    },
  })

  // Merge-safe: relê o produto_data atual e sobrescreve só ww_fornecedores,
  // pra não apagar outras chaves (ww_local, ww_destino, etc).
  async function persist(next: Fornecedor[]) {
    if (!orgId || !cardId) throw new Error('Workspace/card não identificado.')
    const { data: cur, error: readErr } = await sbAny
      .from('cards')
      .select('produto_data')
      .eq('id', cardId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (readErr) throw readErr
    const pd =
      cur?.produto_data && typeof cur.produto_data === 'object'
        ? (cur.produto_data as Record<string, unknown>)
        : {}
    const { error } = await sbAny
      .from('cards')
      .update({ produto_data: { ...pd, ww_fornecedores: next } })
      .eq('id', cardId)
      .eq('org_id', orgId)
    if (error) throw error
  }

  const add = useMutation<void, Error, Omit<Fornecedor, 'id'>>({
    mutationFn: async (input) => {
      const novo: Fornecedor = { ...input, id: crypto.randomUUID() }
      await persist([...(query.data ?? []), novo])
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planejamento', 'fornecedores'] })
      toast.success('Fornecedor adicionado.')
    },
    onError: (err) => toast.error(`Não consegui adicionar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await persist((query.data ?? []).filter((f) => f.id !== id))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planejamento', 'fornecedores'] })
      toast.success('Fornecedor removido.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const setStatus = useMutation<void, Error, { id: string; status: FornecedorStatus }>({
    mutationFn: async ({ id, status }) => {
      await persist((query.data ?? []).map((f) => (f.id === id ? { ...f, status } : f)))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planejamento', 'fornecedores'] })
    },
    onError: (err) => toast.error(`Não consegui mudar a fase: ${err.message}`),
  })

  return {
    fornecedores: query.data ?? [],
    isLoading: query.isLoading,
    add,
    remove,
    setStatus,
  }
}
