import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import {
  EXTRA_STATUS_ORDER,
  type ExtraItem,
  type ExtraStatus,
  type GuestExtra,
} from './types'

/**
 * Lê convidados CONFIRMADOS + estado de extras da view v_wedding_guest_extras,
 * filtrando por org (workspace ativo) e, opcionalmente, por casamento (card_id).
 *
 * A view já só retorna guests com status_rsvp='confirmado'. Quem ainda não
 * recebeu nenhuma ação vem com extras_status='oferecido' (default), sem linha
 * em wedding_guest_extras — por isso extras_id pode ser null.
 */
interface ExtrasRow {
  guest_id: string
  card_id: string
  org_id: string
  nome: string | null
  sobrenome: string | null
  telefone: string | null
  email: string | null
  casamento_nome: string | null
  extras_status: ExtraStatus
  itens: ExtraItem[] | null
  observacoes: string | null
  extras_id: string | null
}

function isExtraStatus(value: unknown): value is ExtraStatus {
  return (
    value === 'oferecido' ||
    value === 'interessado' ||
    value === 'confirmado' ||
    value === 'pago'
  )
}

export function useGuestExtras(cardId: string | null) {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  const query = useQuery<GuestExtra[]>({
    queryKey: ['guest-extras', orgId, cardId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      // Sem card_id, a view roda org-wide: a org Weddings já tem 1600+ convidados
      // confirmados, acima do cap de 1000 do PostgREST. Sem paginação, o board de
      // Extras mostrava só ~1000 e perdia o resto em silêncio. Pagina por .range()
      // com ordem estável (guest_id), mesmo padrão de useWeddings/usePlanejamentoWeddings.
      const PAGE = 1000
      const rows: ExtrasRow[] = []
      for (let start = 0; ; start += PAGE) {
        let q = sbAny
          .from('v_wedding_guest_extras')
          .select(
            'guest_id, card_id, org_id, nome, sobrenome, telefone, email, casamento_nome, extras_status, itens, observacoes, extras_id',
          )
          .eq('org_id', orgId)
        if (cardId) q = q.eq('card_id', cardId)

        const { data, error } = await q
          .order('guest_id', { ascending: true })
          .range(start, start + PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as ExtrasRow[]
        rows.push(...page)
        if (page.length < PAGE) break
      }
      return rows
        .map<GuestExtra>((row) => ({
          guest_id: row.guest_id,
          card_id: row.card_id,
          org_id: row.org_id,
          nome: row.nome ?? '(sem nome)',
          sobrenome: row.sobrenome,
          telefone: row.telefone,
          email: row.email,
          casamento_nome: row.casamento_nome,
          extras_status: isExtraStatus(row.extras_status) ? row.extras_status : 'oferecido',
          itens: Array.isArray(row.itens) ? row.itens : [],
          observacoes: row.observacoes,
          extras_id: row.extras_id,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    },
  })

  const groupedByStatus = useMemo(() => {
    const map = new Map<ExtraStatus, GuestExtra[]>()
    for (const col of EXTRA_STATUS_ORDER) map.set(col, [])
    for (const g of query.data ?? []) {
      map.get(g.extras_status)?.push(g)
    }
    return map
  }, [query.data])

  return {
    data: query.data ?? [],
    groupedByStatus,
    isLoading: query.isLoading,
  }
}
