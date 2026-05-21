import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'

/**
 * Retorna o conjunto de cards onde o usuário logado tem tarefa pendente
 * que foi delegada a ele (criada por outra pessoa ou pelo sistema) e
 * que ele ainda não abriu desde a criação da tarefa.
 *
 * Usado pelo KanbanCard para mostrar dot pulsante "tarefa nova atribuída".
 * O dot some automaticamente quando o usuário abre o card (CardDetail
 * registra last_opened_at via record_card_open).
 */
export function useUnreadDelegatedTaskCards() {
  const { user } = useAuth()
  const { org } = useOrg()
  const activeOrgId = org?.id

  const query = useQuery({
    queryKey: ['unread-delegated-tasks', user?.id, activeOrgId],
    enabled: !!user?.id && !!activeOrgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora dos types gerados
      const { data, error } = await (supabase as any).rpc('get_unread_delegated_task_card_ids')
      if (error) throw error
      return (data ?? []) as string[]
    },
  })

  const unreadSet = useMemo(() => new Set(query.data ?? []), [query.data])

  return {
    hasUnread: (cardId: string | null | undefined) => !!cardId && unreadSet.has(cardId),
    isLoading: query.isLoading,
  }
}
