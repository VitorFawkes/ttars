import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import type { FornecedorBankEntry } from './types'

// Banco de fornecedores (catálogo per-workspace, reutilizável entre casamentos).
// Interim em localStorage — mesmo padrão dos templates de fluxo de Convidados.
// Migrar para tabela própria (fornecedores_bank) quando o modelo solidificar.

const KEY = (orgId: string) => `welcomecrm:planejamento:fornecedor-bank:v1:${orgId}`

function readBank(orgId: string): FornecedorBankEntry[] {
  try {
    const raw = localStorage.getItem(KEY(orgId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as FornecedorBankEntry[]) : []
  } catch {
    return []
  }
}

function writeBank(orgId: string, list: FornecedorBankEntry[]) {
  localStorage.setItem(KEY(orgId), JSON.stringify(list))
}

export function useFornecedorBank() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<FornecedorBankEntry[]>({
    queryKey: ['fornecedor-bank', orgId],
    enabled: !!orgId,
    queryFn: async () => (orgId ? readBank(orgId) : []),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fornecedor-bank'] })

  const add = useMutation<void, Error, Omit<FornecedorBankEntry, 'id'>>({
    mutationFn: async (input) => {
      if (!orgId) throw new Error('Workspace não identificado.')
      const novo: FornecedorBankEntry = { ...input, id: crypto.randomUUID() }
      writeBank(orgId, [...(query.data ?? []), novo])
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor salvo no banco.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (!orgId) throw new Error('Workspace não identificado.')
      writeBank(orgId, (query.data ?? []).filter((e) => e.id !== id))
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Fornecedor removido do banco.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const update = useMutation<void, Error, FornecedorBankEntry>({
    mutationFn: async (entry) => {
      if (!orgId) throw new Error('Workspace não identificado.')
      writeBank(orgId, (query.data ?? []).map((e) => (e.id === entry.id ? entry : e)))
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
