import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { WeddingHotel } from './types'

// Ficha de hotel por casamento — tabela wedding_hotel (1:1 com card, per-org,
// FK-cross-org strict + RLS). Fonte única compartilhada entre Convidados e
// Planejamento. Espelha o padrão de useWeddingFluxo (batch + single).

const COLS =
  'card_id, nome, categoria, localizacao, check_in, check_out, total_quartos, quartos_reservados, contato_nome, contato_email, contato_telefone, site_url, tarifa, status, observacoes'

interface WeddingHotelRow extends WeddingHotel {
  card_id: string
}

function rowToHotel(row: WeddingHotelRow): WeddingHotel {
  const { card_id: _cardId, ...hotel } = row
  return hotel
}

// ────────────────────────────────────────────────────────────────────────
// useAllWeddingHotels — fetch em batch da org ativa (evita N+1 na lista)
// ────────────────────────────────────────────────────────────────────────

/** `Record<cardId, WeddingHotel>` de todos os casamentos da org com hotel
 *  cadastrado. Usado pela lista de cards (CasamentoCard) via cache compartilhado. */
export function useAllWeddingHotels() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<Record<string, WeddingHotel>>({
    queryKey: ['convidados', 'all-wedding-hotels', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const { data, error } = await sbAny
        .from('wedding_hotel')
        .select(COLS)
        .eq('org_id', orgId)
        .limit(5000)
      if (error) throw error
      const map: Record<string, WeddingHotel> = {}
      for (const row of (data ?? []) as WeddingHotelRow[]) {
        map[row.card_id] = rowToHotel(row)
      }
      return map
    },
  })
}

// ────────────────────────────────────────────────────────────────────────
// useWeddingHotel — ficha de um único casamento (lê do cache do batch)
// ────────────────────────────────────────────────────────────────────────

/** Lê/salva/limpa a ficha de hotel de um casamento. Reusa o cache de
 *  useAllWeddingHotels pra não disparar fetch extra na lista. */
export function useWeddingHotel(cardId: string | null) {
  const qc = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const allQuery = useAllWeddingHotels()

  const hotel: WeddingHotel | null = useMemo(
    () => (cardId ? allQuery.data?.[cardId] ?? null : null),
    [cardId, allQuery.data],
  )

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['convidados', 'all-wedding-hotels', orgId] })
  }, [qc, orgId])

  const saveMut = useMutation({
    mutationFn: async (next: WeddingHotel) => {
      if (!cardId) throw new Error('sem cardId')
      const { error } = await sbAny
        .from('wedding_hotel')
        .upsert({ card_id: cardId, ...next }, { onConflict: 'card_id' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const clearMut = useMutation({
    mutationFn: async () => {
      if (!cardId) throw new Error('sem cardId')
      const { error } = await sbAny.from('wedding_hotel').delete().eq('card_id', cardId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const save = useCallback((next: WeddingHotel) => saveMut.mutate(next), [saveMut])
  const clear = useCallback(() => clearMut.mutate(), [clearMut])

  return { hotel, save, clear, isLoading: allQuery.isLoading, isSaving: saveMut.isPending }
}
