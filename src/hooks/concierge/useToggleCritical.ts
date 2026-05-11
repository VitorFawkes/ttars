import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

/**
 * Toggle crítico:
 * - Tarefa: tarefas.prioridade ↔ 'critica' / 'media'
 * - Viagem: cards.is_critical bool
 */

export function useToggleTarefaCritica() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { tarefa_id: string; isCritical: boolean }>({
    mutationFn: async ({ tarefa_id, isCritical }) => {
      const { error } = await sbAny.from('tarefas')
        .update({ prioridade: isCritical ? 'critica' : 'media' })
        .eq('id', tarefa_id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      toast.success(vars.isCritical ? 'Marcada como crítica' : 'Criticidade removida')
    },
    onError: (err) => toast.error('Não foi possível atualizar', { description: err.message }),
  })
}

export function useToggleCardCritical() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { card_id: string; isCritical: boolean }>({
    mutationFn: async ({ card_id, isCritical }) => {
      const { error } = await sbAny.from('cards')
        .update({ is_critical: isCritical })
        .eq('id', card_id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['card', vars.card_id] })
      queryClient.invalidateQueries({ queryKey: ['card-detail', vars.card_id] })
      toast.success(vars.isCritical ? 'Viagem marcada como crítica' : 'Criticidade removida')
    },
    onError: (err) => toast.error('Não foi possível atualizar', { description: err.message }),
  })
}
