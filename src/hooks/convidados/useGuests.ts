import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { Guest, StatusRSVP } from './types'

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
}

export function useGuests(cardId: string | null | undefined) {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<Guest[]>({
    queryKey: ['convidados', 'guests', orgId, cardId],
    enabled: !!orgId && !!cardId,
    queryFn: async () => {
      if (!orgId || !cardId) return []
      const { data, error } = await sbAny
        .from('wedding_guests')
        .select('id, card_id, contato_id, org_id, status_rsvp, observacoes, created_at, updated_at, created_by, contatos!inner(nome, sobrenome, telefone, email)')
        .eq('card_id', cardId)
        .eq('org_id', orgId)
      if (error) throw error
      const rows = (data ?? []) as Row[]
      return rows
        .map(flattenGuest)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    },
  })
}

export function flattenGuest(row: Row): Guest {
  return {
    id: row.id,
    card_id: row.card_id,
    contato_id: row.contato_id,
    org_id: row.org_id,
    nome: row.contatos?.nome ?? '(sem nome)',
    sobrenome: row.contatos?.sobrenome ?? null,
    telefone: row.contatos?.telefone ?? null,
    email: row.contatos?.email ?? null,
    status_rsvp: row.status_rsvp,
    observacoes: row.observacoes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  }
}
