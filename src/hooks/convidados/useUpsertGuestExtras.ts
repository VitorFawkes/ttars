import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import { EXTRA_STATUS_LABEL, type ExtraItem, type ExtraStatus, type GuestExtra } from './types'

const itemSchema = z.object({
  id: z.string(),
  descricao: z.string(),
  valor: z.number().nullable().optional(),
})

const inputSchema = z.object({
  guest_id: z.string().uuid(),
  status: z.enum(['oferecido', 'interessado', 'confirmado', 'pago']).optional(),
  itens: z.array(itemSchema).optional(),
  observacoes: z.string().nullable().optional(),
})

export interface UpsertGuestExtrasInput {
  guest_id: string
  status?: ExtraStatus
  itens?: ExtraItem[]
  observacoes?: string | null
  /** true quando a mutation veio de arrastar o card (toast/feedback mais enxuto). */
  fromDrag?: boolean
}

/**
 * Upsert do estado de extras de um convidado via RPC upsert_guest_extras
 * (SECURITY DEFINER, valida org). Optimistic update no cache ['guest-extras'].
 * Params omitidos = "não mexer nesse campo".
 */
export function useUpsertGuestExtras() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useMutation({
    mutationFn: async (input: UpsertGuestExtrasInput) => {
      const parsed = inputSchema.parse({
        guest_id: input.guest_id,
        status: input.status,
        itens: input.itens,
        observacoes: input.observacoes,
      })
      const { error } = await sbAny.rpc('upsert_guest_extras', {
        p_guest_id: parsed.guest_id,
        p_status: parsed.status ?? null,
        p_itens: parsed.itens ?? null,
        p_observacoes: parsed.observacoes ?? null,
      })
      if (error) throw error
    },
    onMutate: async (input) => {
      const queryKey = ['guest-extras', orgId] as const
      await queryClient.cancelQueries({ queryKey })
      const snapshots = queryClient.getQueriesData<GuestExtra[]>({ queryKey })
      for (const [key, value] of snapshots) {
        if (!Array.isArray(value)) continue
        queryClient.setQueryData(
          key,
          value.map((g) =>
            g.guest_id === input.guest_id
              ? {
                  ...g,
                  extras_status: input.status ?? g.extras_status,
                  itens: input.itens ?? g.itens,
                  observacoes: input.observacoes !== undefined ? input.observacoes : g.observacoes,
                }
              : g,
          ),
        )
      }
      return { snapshots }
    },
    onError: (err: Error, _input, context) => {
      if (context) {
        for (const [key, value] of context.snapshots) {
          queryClient.setQueryData(key, value)
        }
      }
      toast.error(`Não consegui salvar: ${err.message}`)
    },
    onSuccess: (_data, input) => {
      if (input.fromDrag && input.status) {
        toast.success(`Movido para: ${EXTRA_STATUS_LABEL[input.status]}`)
      } else if (!input.fromDrag) {
        toast.success('Extras atualizados')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-extras', orgId] })
    },
  })
}
