import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from '../convidados/_supabaseUntyped'

interface SaveInput {
  cardId: string
  values: Record<string, unknown>
}

/**
 * Salva campos do Planejamento em cards.produto_data (sem migração — produto_data
 * é JSONB). Faz read-modify-write pra não sobrescrever as outras chaves, e
 * invalida as queries do planejamento (recalcula a trava). Isolado por org via RLS.
 */
export function usePlanejamentoCampos() {
  const queryClient = useQueryClient()

  const save = useMutation<void, Error, SaveInput>({
    mutationFn: async ({ cardId, values }) => {
      const { data, error: readErr } = await sbAny
        .from('cards')
        .select('produto_data')
        .eq('id', cardId)
        .maybeSingle()
      if (readErr) throw readErr

      const current = (data?.produto_data ?? {}) as Record<string, unknown>
      // Remove chaves esvaziadas (string vazia) pra não poluir o JSON.
      const merged: Record<string, unknown> = { ...current }
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v == null) delete merged[k]
        else merged[k] = v
      }

      const { error } = await sbAny.from('cards').update({ produto_data: merged }).eq('id', cardId)
      if (error) throw error
    },
    onError: (err) => toast.error(`Não consegui salvar: ${err.message}`),
    onSettled: async () => {
      // Recarrega weddings (produto_data) e o estado/trava do planejamento.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['convidados', 'weddings'] }),
        queryClient.invalidateQueries({ queryKey: ['planejamento'] }),
      ])
    },
  })

  return { save }
}
