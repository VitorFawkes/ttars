import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import type { ChecklistItem } from './types'

// Cronograma & checklist por casamento — tabela wedding_checklist (per-org,
// FK ao card). org_id forçado pelo trigger strict a partir de cards.org_id;
// RLS isola por workspace. Queries filtram org_id + card_id.

export function useWeddingChecklist(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const queryClient = useQueryClient()

  const query = useQuery<ChecklistItem[]>({
    queryKey: ['planejamento', 'checklist', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('wedding_checklist')
        .select('id, titulo, prazo, feito, observacoes, tipo, marco, ordem, stage_id, trava, gera_cobranca, abre_doc')
        .eq('org_id', orgId)
        .eq('card_id', cardId)
        .order('ordem', { ascending: true })
        .order('feito', { ascending: true })
        .order('prazo', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ChecklistItem[]
    },
  })

  // Invalida o planejamento inteiro: além da lista, recalcula o gate (roll-up
  // marco ← tarefas vive em ['planejamento','gate-data']).
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['planejamento'] })

  const add = useMutation<void, Error, Omit<ChecklistItem, 'id'>>({
    mutationFn: async (input) => {
      const { error } = await sbAny.from('wedding_checklist').insert({ card_id: cardId, ...input })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Item adicionado.')
    },
    onError: (err) => toast.error(`Não consegui adicionar: ${err.message}`),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await sbAny.from('wedding_checklist').delete().eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Item removido.')
    },
    onError: (err) => toast.error(`Não consegui remover: ${err.message}`),
  })

  const update = useMutation<void, Error, ChecklistItem>({
    mutationFn: async (item) => {
      const { id, ...rest } = item
      const { error } = await sbAny.from('wedding_checklist').update(rest).eq('id', id).eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Item atualizado.')
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
  })

  const toggle = useMutation<void, Error, { id: string; feito: boolean }>({
    mutationFn: async ({ id, feito }) => {
      const { error } = await sbAny
        .from('wedding_checklist')
        .update({ feito })
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (err) => toast.error(`Não consegui atualizar: ${err.message}`),
  })

  const items = query.data ?? []

  /** Próxima `ordem` pra uma tarefa nova (no fim da lista, ou do marco). */
  const nextOrdem = (marco?: string | null): number => {
    const scope = marco === undefined ? items : items.filter((i) => i.marco === marco)
    return scope.reduce((max, i) => Math.max(max, i.ordem ?? 0), -1) + 1
  }

  return {
    items,
    isLoading: query.isLoading,
    add,
    remove,
    update,
    toggle,
    nextOrdem,
  }
}
