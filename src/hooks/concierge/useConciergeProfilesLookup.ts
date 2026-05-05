import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Lookup leve id → nome usado em telas/cards/modais do Concierge.
 * Cache compartilhado por queryKey: muitos componentes podem chamar
 * sem causar requisições redundantes (a mesma chave reusa o cache).
 */
export function useConciergeProfilesLookup() {
  const { data } = useQuery({
    queryKey: ['concierge', 'profiles-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email')
      if (error) throw error
      const map = new Map<string, string>()
      for (const p of data ?? []) {
        const display = (p.nome && p.nome.trim()) || (p.email ?? '')
        if (display) map.set(p.id, display)
      }
      return map
    },
    staleTime: 5 * 60 * 1000,
  })
  return data
}
