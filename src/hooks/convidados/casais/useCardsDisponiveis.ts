import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../../contexts/OrgContext'
import { sbAny } from '../_supabaseUntyped'

export interface CardDisponivel {
  id: string
  titulo: string
  wedding_date: string | null
}

export function useCardsDisponiveis() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  return useQuery<CardDisponivel[]>({
    queryKey: ['casais', 'cards-disponiveis', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await sbAny.rpc('wedding_casal_admin_cards_disponiveis')
      if (error) throw error
      return (data ?? []) as CardDisponivel[]
    },
  })
}
