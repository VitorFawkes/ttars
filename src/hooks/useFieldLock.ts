import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface UseFieldLockReturn {
  isLocked: (fieldKey: string) => boolean
  toggleLock: (fieldKey: string) => void
  setLocked: (fieldKey: string, locked: boolean) => void
  lockedFields: Record<string, boolean>
  isUpdating: boolean
}

// Tipo para resposta do card com locked_fields
interface CardWithLockedFields {
  locked_fields?: Record<string, boolean> | null
}

/**
 * Hook para gerenciar bloqueio de campos individuais em um card.
 * Campos bloqueados não são atualizados automaticamente pelas integrações (n8n/ActiveCampaign).
 *
 * @param cardId - ID do card
 * @returns Funções e estado para gerenciar locks
 */
export function useFieldLock(cardId: string): UseFieldLockReturn {
  const queryClient = useQueryClient()

  // Query para buscar locked_fields do card
  // Usando any temporariamente até a migration ser aplicada e os types regenerados
  const { data: cardData } = useQuery({
    queryKey: ['card-locked-fields', cardId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('cards')
        .select('locked_fields') as any)
        .eq('id', cardId)
        .single()

      if (error) {
        // Se a coluna não existir ainda, retorna objeto vazio
        if (error.code === '42703' || error.message?.includes('locked_fields')) {
          return { locked_fields: {} }
        }
        throw error
      }
      return data as CardWithLockedFields
    },
    enabled: !!cardId,
    staleTime: 30000, // Cache por 30 segundos
  })

  const lockedFields: Record<string, boolean> = (cardData?.locked_fields as Record<string, boolean>) || {}

  // Mutation para atualizar locked_fields
  const updateLockMutation = useMutation({
    mutationFn: async ({ fieldKey, locked }: { fieldKey: string; locked: boolean }) => {
      // Construir novo objeto locked_fields
      const newLockedFields = { ...lockedFields, [fieldKey]: locked }

      // Remover campos com valor false para manter o JSON limpo
      if (!locked) {
        delete newLockedFields[fieldKey]
      }

      // Usando any temporariamente até a migration ser aplicada e os types regenerados
      const { error } = await (supabase
        .from('cards')
        .update({ locked_fields: newLockedFields } as any)
        .eq('id', cardId) as any)

      if (error) throw error
      return newLockedFields
    },
    onMutate: async ({ fieldKey, locked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['card-locked-fields', cardId] })
      await queryClient.cancelQueries({ queryKey: ['card-detail', cardId] })

      // Snapshot do valor anterior
      const previousData = queryClient.getQueryData(['card-locked-fields', cardId])

      // Optimistic update
      const newLockedFields = { ...lockedFields, [fieldKey]: locked }
      if (!locked) delete newLockedFields[fieldKey]

      queryClient.setQueryData(['card-locked-fields', cardId], {
        locked_fields: newLockedFields
      })

      // Também atualizar no card-detail se existir
      queryClient.setQueryData(['card-detail', cardId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          locked_fields: newLockedFields
        }
      })

      return { previousData }
    },
    onError: (_err, _vars, context) => {
      // Rollback em caso de erro
      if (context?.previousData) {
        queryClient.setQueryData(['card-locked-fields', cardId], context.previousData)
      }
    },
    onSettled: () => {
      // Invalidar queries para garantir sincronização
      queryClient.invalidateQueries({ queryKey: ['card-locked-fields', cardId] })
      queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
    }
  })

  const isLocked = (fieldKey: string): boolean => {
    return lockedFields[fieldKey] === true
  }

  const toggleLock = (fieldKey: string): void => {
    updateLockMutation.mutate({ fieldKey, locked: !isLocked(fieldKey) })
  }

  const setLocked = (fieldKey: string, locked: boolean): void => {
    updateLockMutation.mutate({ fieldKey, locked })
  }

  return {
    isLocked,
    toggleLock,
    setLocked,
    lockedFields,
    isUpdating: updateLockMutation.isPending
  }
}
