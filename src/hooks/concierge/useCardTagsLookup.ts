import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

/**
 * Carrega todos os card_tag_assignments do workspace ativo de uma vez,
 * retornando um Map<cardId, Set<tagId>>. Usado pelo Kanban pra filtrar
 * tarefas por tag do card sem N+1.
 */
export function useCardTagsLookup() {
  const { org } = useOrg()
  const orgId = org?.id

  return useQuery({
    queryKey: ['concierge', 'card-tags-lookup', orgId],
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      if (!orgId) return new Map()
      const { data, error } = await sbAny
        .from('card_tag_assignments')
        .select('card_id, tag_id, tag:card_tags!inner(org_id)')
        .eq('tag.org_id', orgId)
      if (error) throw error
      const map = new Map<string, Set<string>>()
      for (const row of (data ?? []) as Array<{ card_id: string; tag_id: string }>) {
        const set = map.get(row.card_id) ?? new Set<string>()
        set.add(row.tag_id)
        map.set(row.card_id, set)
      }
      return map
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  })
}
