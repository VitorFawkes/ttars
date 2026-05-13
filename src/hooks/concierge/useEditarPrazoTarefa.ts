import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface EditarPrazoInput {
  tarefaId: string
  /** ISO timestamp do novo prazo (`tarefas.data_vencimento`). */
  data: string
}

/**
 * Atualiza `tarefas.data_vencimento`. Usado quando o concierge precisa
 * ajustar o prazo de um atendimento — quem criou a tarefa (vendedor,
 * trigger automático) nem sempre tem a noção certa.
 *
 * Diferente de `useSnoozeAtendimento`: este edita o **prazo da tarefa**
 * (`data_vencimento`), que define o `status_apresentacao` (vencido/hoje/
 * esta_semana/futuro) e aparece como "Prazo" no card. O snooze edita
 * `concierge_futuro_em`, que é só a flag sticky da coluna "Futuro".
 */
export function useEditarPrazoTarefa() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, EditarPrazoInput>({
    mutationFn: async ({ tarefaId, data }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ data_vencimento: data })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
      toast.success('Prazo atualizado')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar o prazo: ${err.message}`)
    },
  })
}
