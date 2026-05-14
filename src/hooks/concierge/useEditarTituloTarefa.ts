import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface EditarTituloInput {
  tarefaId: string
  titulo: string
}

export function useEditarTituloTarefa() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, EditarTituloInput>({
    mutationFn: async ({ tarefaId, titulo }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ titulo })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
      toast.success('Título atualizado')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar o título: ${err.message}`)
    },
  })
}
