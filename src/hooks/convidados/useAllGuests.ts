import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { GuestWithWedding, StatusRSVP } from './types'

export interface AllGuestsFilters {
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

/**
 * Lê todos os convidados da org (sem fixar wedding). Pós Lista de Convidados
 * pública, contato_id pode ser NULL — usa view v_wedding_guests_resolved
 * que faz COALESCE entre nome_raw (preenchido pelo casal) e contatos.nome.
 *
 * Guests órfãos (sem card_id ainda — pertencem a casal não vinculado) são
 * filtrados; só listamos os já atrelados a algum casamento.
 */
interface ResolvedRow {
  id: string
  card_id: string | null
  contato_id: string | null
  org_id: string
  status_rsvp: StatusRSVP
  observacoes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  nome_display: string | null
  sobrenome_display: string | null
  telefone_display: string | null
  email_display: string | null
  cards?: { id: string; titulo: string } | null
}

export function useAllGuests(filters: AllGuestsFilters) {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<GuestWithWedding[]>({
    queryKey: ['convidados', 'all-guests', orgId, filters],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []

      const buildBaseQuery = () => {
        let q = sbAny
          .from('v_wedding_guests_resolved')
          .select(
            'id, card_id, contato_id, org_id, status_rsvp, observacoes, created_at, updated_at, created_by, nome_display, sobrenome_display, telefone_display, email_display, cards!inner(id, titulo)',
          )
          .eq('org_id', orgId)
          .not('card_id', 'is', null)
          // Ordenação estável por PK: sem ela, a paginação por offset (.range)
          // é indefinida e descarta/duplica linhas entre páginas, subnotificando
          // a contagem de convidados na lista. Ver useWeddings (mesmo padrão).
          .order('id', { ascending: true })
        if (filters.statusFilter.length > 0) q = q.in('status_rsvp', filters.statusFilter)
        if (filters.weddingFilter.length > 0) q = q.in('card_id', filters.weddingFilter)
        return q
      }

      // PostgREST cap em 1000 → paginação.
      const PAGE = 1000
      const rows: ResolvedRow[] = []
      for (let start = 0; ; start += PAGE) {
        const { data, error } = await buildBaseQuery().range(start, start + PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as ResolvedRow[]
        rows.push(...page)
        if (page.length < PAGE) break
      }

      // A busca por texto é client-side (instantânea, sem refetch) no
      // GuestKanbanBoard — por isso `search` não entra nem nos filtros nem na
      // queryKey. Só status/casamento (que mudam o recorte do servidor) fazem
      // refetch. Ver ConvidadosBoard.
      const mapped: GuestWithWedding[] = rows
        .map((row) => ({
          id: row.id,
          card_id: row.card_id || '',
          contato_id: row.contato_id || '',
          org_id: row.org_id,
          nome: row.nome_display ?? '(sem nome)',
          sobrenome: row.sobrenome_display ?? null,
          telefone: row.telefone_display ?? null,
          email: row.email_display ?? null,
          status_rsvp: row.status_rsvp,
          observacoes: row.observacoes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          created_by: row.created_by,
          card_titulo: row.cards?.titulo ?? '(sem casamento)',
        }))

      mapped.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
      return mapped
    },
  })
}
