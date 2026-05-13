import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { ChecklistItem } from './types'
import type { KanbanTarefaItem } from './useKanbanTarefas'

interface UpdateChecklistInput {
  tarefaId: string
  /** Array completo de itens — substitui o checklist no banco. A UI gera o
   *  array novo a cada ação (add, toggle, edit, remove) e envia inteiro. */
  itens: ChecklistItem[]
}

interface OptimisticContext {
  previous: Array<[readonly unknown[], unknown]>
}

/**
 * Atualiza `tarefas.checklist` (JSONB). O caller envia o array completo de
 * itens — sem patch granular por id. Usa optimistic update no cache do
 * React Query pra que a UI reflita a mudança IMEDIATAMENTE (importante
 * pro "+ Adicionar item" entrar em modo edição com input já visível).
 */
export function useChecklistTarefa() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, UpdateChecklistInput, OptimisticContext>({
    mutationFn: async ({ tarefaId, itens }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ checklist: itens })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onMutate: async ({ tarefaId, itens }) => {
      // Cancela refetches em voo pra não sobrescrever nosso otimista
      await queryClient.cancelQueries({ queryKey: ['concierge'] })

      const previous: Array<[readonly unknown[], unknown]> = []

      // Atualiza TODAS as queries de kanban-tarefas-base (várias variações
      // por filtro de dono/tipo/source). A view já entrega checklist; só
      // patch o campo no item dessa tarefa.
      queryClient.setQueriesData<KanbanTarefaItem[]>(
        { queryKey: ['concierge', 'kanban-tarefas-base'] },
        (old) => {
          if (!old) return old
          previous.push([['concierge', 'kanban-tarefas-base'], old])
          return old.map(it =>
            it.tarefa_id === tarefaId ? { ...it, checklist: itens } : it
          )
        }
      )

      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [key, value] of ctx.previous) {
          queryClient.setQueryData(key, value)
        }
      }
      toast.error(`Não consegui salvar o checklist: ${err.message}`)
    },
    onSettled: () => {
      // Garante consistência final com o banco
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
    },
  })
}
