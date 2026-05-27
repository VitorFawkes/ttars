import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { Guest, StatusRSVP } from './types'

/**
 * Lê convidados de um casamento.
 *
 * Após Lista de Convidados pública (maio/2026), wedding_guests passou a tolerar
 * contato_id NULL (casal preenche pessoas sem criar contato no CRM). Usamos
 * a view v_wedding_guests_resolved que faz COALESCE entre dados denormalizados
 * (nome_raw/telefone_raw) e o JOIN com contatos.
 */
interface ResolvedRow {
  id: string
  card_id: string | null
  casal_id: string | null
  convite_id: string | null
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
  convite_nome: string | null
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
        .from('v_wedding_guests_resolved')
        .select(
          'id, card_id, casal_id, convite_id, contato_id, org_id, status_rsvp, observacoes, created_at, updated_at, created_by, nome_display, sobrenome_display, telefone_display, email_display, convite_nome',
        )
        .eq('card_id', cardId)
        .eq('org_id', orgId)
      if (error) throw error
      const rows = (data ?? []) as ResolvedRow[]
      return rows
        .map(flattenGuest)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    },
  })
}

export function flattenGuest(row: ResolvedRow): Guest {
  return {
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
  }
}
