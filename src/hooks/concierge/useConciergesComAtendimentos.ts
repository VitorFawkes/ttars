import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface ConciergeUserCompacto {
  id: string
  nome: string
}

/**
 * Retorna apenas concierges que têm pelo menos UM atendimento atribuído
 * (qualquer outcome). Usado pelo ConsultorPicker do Kanban Concierge —
 * não faz sentido oferecer pra filtrar por alguém que não tem trabalho
 * algum no produto.
 *
 * Observação: a RLS de atendimentos_concierge filtra por org, então
 * só vêm concierges com trabalho na workspace atual. Profiles tem
 * RLS mais permissiva, mas o JOIN limita pelos donos reais de
 * atendimentos da org.
 */
export function useConciergesComAtendimentos() {
  return useQuery({
    queryKey: ['concierge', 'users-com-atendimentos'],
    queryFn: async (): Promise<ConciergeUserCompacto[]> => {
      // Pega todos os dono_id distintos via view v_meu_dia_concierge
      // (filtrada por org_id pela própria view).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase as any)
        .from('v_meu_dia_concierge')
        .select('dono_id')
        .not('dono_id', 'is', null)
      if (error) throw error
      const ids = new Set<string>()
      for (const r of (rows ?? []) as Array<{ dono_id: string | null }>) {
        if (r.dono_id) ids.add(r.dono_id)
      }
      if (ids.size === 0) return []

      // Busca nomes + filtra por time Concierge (defesa em profundidade —
      // se algum atendimento ficou com responsavel_id de alguém que não
      // é concierge, não aparece no filtro).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profs, error: pErr } = await (supabase as any)
        .from('profiles')
        .select('id, nome, email, team:teams!profiles_team_id_fkey(name)')
        .in('id', Array.from(ids))
        .eq('active', true)
      if (pErr) throw pErr
      const out: ConciergeUserCompacto[] = []
      for (const p of (profs ?? []) as Array<{ id: string; nome: string | null; email: string | null; team: { name: string | null } | null }>) {
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
}
