import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface ToggleInput {
  tarefaId: string
  /** TRUE = estoca em "Agendados para o futuro" (sticky). FALSE = tira. */
  emFuturo: boolean
}

/**
 * Atualiza `tarefas.concierge_em_futuro`. Sticky: quando TRUE, o card fica
 * na coluna "Agendados para o futuro" do kanban /concierge até alguém
 * tirar manualmente. Nada move sozinho.
 *
 * Não mexe em `data_vencimento` — o prazo da tarefa é editado pelo
 * PrazoTarefaEditor no modal de detalhe. A coluna Futuro pulsa amarelo
 * quando algum card tem prazo chegando perto.
 */
export function useToggleEmFuturoConcierge() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, ToggleInput>({
    mutationFn: async ({ tarefaId, emFuturo }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ concierge_em_futuro: emFuturo })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: (_void, { emFuturo }) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      toast.success(emFuturo ? 'Estocado em "Agendados para o futuro"' : 'Voltou pra fila ativa')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar: ${err.message}`)
    },
  })
}
