import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import type { ChecklistItem } from './types'

interface UpdateChecklistInput {
  tarefaId: string
  /** Array completo de itens — substitui o checklist no banco. A UI gera o
   *  array novo a cada ação (add, toggle, edit, remove) e envia inteiro.
   *  Mais simples e tolerante a estado intermediário. */
  itens: ChecklistItem[]
}

/**
 * Atualiza `tarefas.checklist` (JSONB). O caller envia o array completo de
 * itens — sem patch granular por id. A view `v_meu_dia_concierge` já
 * expõe o campo, então invalidar `['concierge']` traz o estado novo.
 *
 * Toast silenciado: a UI já reflete a mudança imediatamente via optimistic
 * update (setQueryData no ChecklistEditor), e cada toggle de checkbox
 * geraria um toast — barulhento demais.
 */
export function useChecklistTarefa() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, UpdateChecklistInput>({
    mutationFn: async ({ tarefaId, itens }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ checklist: itens })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
    },
    onError: (err) => {
      toast.error(`Não consegui salvar o checklist: ${err.message}`)
    },
  })
}
