import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { GuestWithWedding, StatusRSVP } from './types'

export interface AllGuestsFilters {
  search: string
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

interface Row {
  id: string
  card_id: string
  contato_id: string
  org_id: string
  status_rsvp: StatusRSVP
  observacoes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  contatos: {
    nome: string
    sobrenome: string | null
    telefone: string | null
    email: string | null
  } | null
  cards: { id: string; titulo: string } | null
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
          .from('wedding_guests')
          .select('id, card_id, contato_id, org_id, status_rsvp, observacoes, created_at, updated_at, created_by, contatos!inner(nome, sobrenome, telefone, email), cards!inner(id, titulo)')
          .eq('org_id', orgId)
        if (filters.statusFilter.length > 0) q = q.in('status_rsvp', filters.statusFilter)
        if (filters.weddingFilter.length > 0) q = q.in('card_id', filters.weddingFilter)
        return q
      }

      // PostgREST cap em 1000 → paginação.
      const PAGE = 1000
      const rows: Row[] = []
      for (let start = 0; ; start += PAGE) {
        const { data, error } = await buildBaseQuery().range(start, start + PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as Row[]
        rows.push(...page)
        if (page.length < PAGE) break
      }

      const term = filters.search.trim().toLowerCase()
      const mapped: GuestWithWedding[] = rows
        .map(row => {
          const nome = row.contatos?.nome ?? '(sem nome)'
          const telefone = row.contatos?.telefone ?? null
          const email = row.contatos?.email ?? null
          return {
            id: row.id,
            card_id: row.card_id,
            contato_id: row.contato_id,
            org_id: row.org_id,
            nome,
            sobrenome: row.contatos?.sobrenome ?? null,
            telefone,
            email,
            status_rsvp: row.status_rsvp,
            observacoes: row.observacoes,
            created_at: row.created_at,
            updated_at: row.updated_at,
            created_by: row.created_by,
            card_titulo: row.cards?.titulo ?? '(sem casamento)',
          }
        })
        .filter(g => {
          if (!term) return true
          return (
            g.nome.toLowerCase().includes(term) ||
            (g.email ?? '').toLowerCase().includes(term) ||
            (g.telefone ?? '').toLowerCase().includes(term)
          )
        })

      mapped.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
      return mapped
    },
  })
}
