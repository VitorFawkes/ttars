import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sbAny } from './_supabaseUntyped'
import { useOrg } from '../../contexts/OrgContext'

export function useUpdateConciergeFutureThreshold() {
  const queryClient = useQueryClient()
  const { org } = useOrg()

  return useMutation<void, Error, { dias: number }>({
    mutationFn: async ({ dias }) => {
      if (!org?.id) throw new Error('Workspace não carregado')
      if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
        throw new Error('Informe um valor entre 1 e 365 dias')
      }
      // RLS bloqueia UPDATE direto em organizations pra membros não-admin.
      // RPC SECURITY DEFINER valida membership via requesting_org_id().
      // Usa sbAny pra evitar dependência do database.types.ts (regenerado fora do PR).
      const { error } = await sbAny.rpc('rpc_update_concierge_future_threshold', {
        p_dias: Math.round(dias),
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Threshold atualizado')
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      queryClient.invalidateQueries({ queryKey: ['concierge'] })
    },
    onError: (err) => {
      toast.error('Não foi possível atualizar', { description: err.message })
    },
  })
}
