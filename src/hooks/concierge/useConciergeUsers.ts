import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface ConciergeUser {
  id: string
  nome: string
}

/**
 * Lista ordenada de profiles ativos do time "Concierge".
 * Usado em dropdowns que precisam escolher entre concierges
 * (ex: trocar atribuído de um atendimento, criar novo atendimento).
 */
export function useConciergeUsers() {
  const { data } = useQuery({
    queryKey: ['concierge', 'users-list'],
    queryFn: async (): Promise<ConciergeUser[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, nome, email, team:teams!profiles_team_id_fkey(name)')
        .eq('active', true)
      if (error) throw error
      const out: ConciergeUser[] = []
      for (const p of (data ?? []) as Array<{ id: string; nome: string | null; email: string | null; team: { name: string | null } | null }>) {
        const tn = p.team?.name
        if (typeof tn === 'string' && tn.toLowerCase() === 'concierge') {
          out.push({ id: p.id, nome: p.nome || p.email || '' })
        }
      }
      out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      return out
    },
    staleTime: 5 * 60 * 1000,
  })
  return data ?? []
}
