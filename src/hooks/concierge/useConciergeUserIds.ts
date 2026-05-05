import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Conjunto de profile IDs que pertencem ao time "Concierge"
 * (na org atual ou na account pai, conforme RLS).
 *
 * Usado por editores que precisam ramificar UX (ex: pedir tipo +
 * categoria de atendimento quando o responsável da tarefa é concierge).
 */
export function useConciergeUserIds() {
  const { data } = useQuery({
    queryKey: ['concierge', 'user-ids'],
    queryFn: async () => {
      // Eslint-disable: select com embed retorna shape dinâmica
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, team:teams!profiles_team_id_fkey(name)')
        .eq('active', true)
      if (error) throw error
      const ids = new Set<string>()
      for (const p of (data ?? []) as Array<{ id: string; team: { name: string | null } | null }>) {
        const teamName = p.team?.name
        if (typeof teamName === 'string' && teamName.toLowerCase() === 'concierge') {
          ids.add(p.id)
        }
      }
      return ids
    },
    staleTime: 5 * 60 * 1000,
  })
  return data
}
