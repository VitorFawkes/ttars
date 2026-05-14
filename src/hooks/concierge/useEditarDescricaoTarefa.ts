import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'

interface EditarDescricaoInput {
  tarefaId: string
  descricao: string | null
}

export function useEditarDescricaoTarefa() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, EditarDescricaoInput>({
    mutationFn: async ({ tarefaId, descricao }) => {
      const { error } = await sbAny
        .from('tarefas')
        .update({ descricao })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
      queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
      toast.success('Descrição atualizada')
    },
    onError: (err) => {
      toast.error(`Não consegui atualizar a descrição: ${err.message}`)
    },
  })
}
