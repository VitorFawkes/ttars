import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ChecklistData {
  meu: string[]                    // item_keys marcados pelo passageiro atual
  agregado: Record<string, number> // item_key → qtd de passageiros que marcaram
}

export const checklistKeys = {
  all: ['checklist'] as const,
  byViagem: (token: string, participantId: string) =>
    ['checklist', token, participantId] as const,
}

export function useChecklist(token: string | undefined, participantId: string | null | undefined) {
  const enabled = !!token && !!participantId

  return useQuery({
    queryKey: enabled ? checklistKeys.byViagem(token!, participantId!) : ['checklist', 'none'],
    queryFn: async (): Promise<ChecklistData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_checklist', {
        p_token: token,
        p_participant_id: participantId,
      })
      if (error) throw error
      return data as ChecklistData
    },
    enabled,
    staleTime: 30_000,
  })
}

export function useToggleChecklist(token: string | undefined, participantId: string | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { item_key: string; checked: boolean }) => {
      if (!token || !participantId) throw new Error('Faltam token ou participant')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('marcar_checklist', {
        p_token: token,
        p_participant_id: participantId,
        p_item_key: input.item_key,
        p_checked: input.checked,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      if (token && participantId) {
        queryClient.invalidateQueries({
          queryKey: checklistKeys.byViagem(token, participantId),
        })
      }
    },
  })
}
