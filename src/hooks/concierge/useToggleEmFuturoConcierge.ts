import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface ToggleInput {
  tarefaId: string
  /** TRUE = estoca em "Agendados para o futuro" (sticky). FALSE = tira. */
  emFuturo: boolean
  /** Dias antes do prazo pra começar a piscar. Opcional — quando passado,
   *  atualiza concierge_aviso_dias na mesma mutation. Tipicamente passado
   *  ao estocar (TRUE) ou ao editar o aviso de um card já estocado. */
  avisoDias?: number
}

/**
 * Atualiza `tarefas.concierge_em_futuro` (e opcionalmente
 * `concierge_aviso_dias`). Sticky: quando emFuturo=TRUE, o card fica
 * na coluna "Agendados para o futuro" do kanban /concierge até alguém
 * tirar manualmente. Nada move sozinho.
 *
 * Não mexe em `data_vencimento` — o prazo da tarefa é editado pelo
 * PrazoTarefaEditor no modal de detalhe. A coluna Futuro pulsa amarelo
 * quando algum card tem prazo chegando perto (cada card define a
 * antecedência via concierge_aviso_dias).
 */
export function useToggleEmFuturoConcierge() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, ToggleInput>({
    mutationFn: async ({ tarefaId, emFuturo, avisoDias }) => {
      const update: { concierge_em_futuro: boolean; concierge_aviso_dias?: number } = {
        concierge_em_futuro: emFuturo,
      }
      if (typeof avisoDias === 'number' && Number.isFinite(avisoDias) && avisoDias > 0) {
        update.concierge_aviso_dias = Math.max(1, Math.round(avisoDias))
      }
      const { error } = await sbAny
        .from('tarefas')
        .update(update)
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
