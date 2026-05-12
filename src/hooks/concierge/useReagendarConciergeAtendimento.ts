import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { KanbanTarefaItem } from './useKanbanTarefas'
import { computeEstadoFunil, DEFAULT_CONCIERGE_FUTURE_THRESHOLD_DAYS } from './useKanbanTarefas'
import { useOrg } from '../../contexts/OrgContext'

interface ReagendarInput {
  atendimento: KanbanTarefaItem
  nova_data: string
}

interface OptimisticContext {
  rollback: () => void
}

export function useReagendarConciergeAtendimento() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const thresholdDays = org?.concierge_future_threshold_days ?? DEFAULT_CONCIERGE_FUTURE_THRESHOLD_DAYS

  return useMutation<void, Error, ReagendarInput, OptimisticContext>({
    mutationFn: async ({ atendimento, nova_data }) => {
      const tarefaId = atendimento.tarefa_id
      const { error } = await sbAny
        .from('tarefas')
        .update({ data_vencimento: nova_data })
        .eq('id', tarefaId)
      if (error) throw error
    },

    onMutate: async ({ atendimento, nova_data }) => {
      await queryClient.cancelQueries({ queryKey: ['concierge'] })

      const previous: Array<[readonly unknown[], unknown]> = []
      queryClient.setQueriesData<KanbanTarefaItem[]>(
        { queryKey: ['concierge', 'kanban-tarefas-base'] },
        (old) => {
          if (!old) return old
          previous.push([['concierge', 'kanban-tarefas-base'], old])
          return old.map(item => {
            if (item.atendimento_id !== atendimento.atendimento_id) return item
            const next = { ...item, data_vencimento: nova_data }
            return { ...next, estado_funil: computeEstadoFunil(next, thresholdDays) }
          })
        }
      )

      return {
        rollback: () => {
          for (const [key, value] of previous) {
            queryClient.setQueryData(key, value)
          }
        },
      }
    },

    onError: (err, _vars, context) => {
      context?.rollback?.()
      toast.error('Não foi possível reagendar o atendimento', { description: err.message })
    },

    onSuccess: () => {
      toast.success('Atendimento reagendado')
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
    },
  })
}
