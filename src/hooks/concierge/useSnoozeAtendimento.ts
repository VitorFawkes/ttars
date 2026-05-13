import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface SnoozeInput {
  tarefaId: string
  /** ISO timestamp da data planejada de retorno. `null` limpa o flag (puxa pra fila). */
  data: string | null
}

/**
 * Atualiza `tarefas.concierge_futuro_em`. Quando preenchido, o atendimento
 * fica na coluna "Agendados para o futuro" do kanban /concierge — sticky,
 * nada move sozinho. `null` limpa o flag e devolve o card pro fluxo normal.
 *
 * A data é só prazo planejado: a UI mostra aviso amber quando chega perto
 * (<=7d) e vermelho quando passa. Mover de fato é decisão manual.
 */
export function useSnoozeAtendimento() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, SnoozeInput>({
    mutationFn: async ({ tarefaId, data }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ concierge_futuro_em: data })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: (_void, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      toast.success(data ? 'Estocado em "Agendados para o futuro"' : 'Voltou pra fila ativa')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar: ${err.message}`)
    },
  })
}
