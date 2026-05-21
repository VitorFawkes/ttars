import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

/** Vínculo de um casamento (card) a uma variação de fluxo.
 *  - fluxoId: id da fluxo_template
 *  - startIndex: posição inicial 1..35 (em qual mensagem começa)
 *  - startDate: data que a mensagem `startIndex` foi/será enviada (ISO yyyy-mm-dd) */
export interface WeddingFluxoAssignment {
  fluxoId: string
  startIndex: number
  startDate: string
}

interface WeddingFluxoRow {
  card_id: string
  fluxo_template_id: string
  start_index: number
  start_date: string  // 'YYYY-MM-DD'
}

function rowToAssignment(row: WeddingFluxoRow): WeddingFluxoAssignment {
  return {
    fluxoId: row.fluxo_template_id,
    startIndex: row.start_index,
    startDate: row.start_date,
  }
}

// ────────────────────────────────────────────────────────────────────────
// useAllWeddingFluxos — fetch em batch da org ativa
// ────────────────────────────────────────────────────────────────────────

/** Retorna `Record<cardId, Assignment>` de todos os casamentos da org com
 *  fluxo configurado. Usado por consumidores que iteram sobre vários
 *  casamentos (Calendário, EnviosDoDia, useWeddingsWithGuestCounts). */
export function useAllWeddingFluxos() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<Record<string, WeddingFluxoAssignment>>({
    queryKey: ['convidados', 'all-wedding-fluxos', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const { data, error } = await sbAny
        .from('wedding_fluxo')
        .select('card_id, fluxo_template_id, start_index, start_date')
        .eq('org_id', orgId)
        .limit(5000)
      if (error) throw error
      const map: Record<string, WeddingFluxoAssignment> = {}
      for (const row of (data ?? []) as WeddingFluxoRow[]) {
        map[row.card_id] = rowToAssignment(row)
      }
      return map
    },
  })
}

// ────────────────────────────────────────────────────────────────────────
// useWeddingFluxo — assignment de um único casamento
// ────────────────────────────────────────────────────────────────────────

/** Hook pra ler/salvar/limpar o assignment de um casamento específico.
 *  Usa o cache compartilhado de `useAllWeddingFluxos` pra evitar fetch extra. */
export function useWeddingFluxo(cardId: string | null) {
  const qc = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const allQuery = useAllWeddingFluxos()

  const assignment: WeddingFluxoAssignment | null = useMemo(
    () => (cardId ? allQuery.data?.[cardId] ?? null : null),
    [cardId, allQuery.data],
  )

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['convidados', 'all-wedding-fluxos', orgId] })
  }, [qc, orgId])

  const saveMut = useMutation({
    mutationFn: async (next: WeddingFluxoAssignment) => {
      if (!cardId) throw new Error('sem cardId')
      const { error } = await sbAny
        .from('wedding_fluxo')
        .upsert(
          {
            card_id: cardId,
            fluxo_template_id: next.fluxoId,
            start_index: next.startIndex,
            start_date: next.startDate,
          },
          { onConflict: 'card_id' },
        )
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const clearMut = useMutation({
    mutationFn: async () => {
      if (!cardId) throw new Error('sem cardId')
      const { error } = await sbAny
        .from('wedding_fluxo')
        .delete()
        .eq('card_id', cardId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const save = useCallback((next: WeddingFluxoAssignment) => {
    saveMut.mutate(next)
  }, [saveMut])

  const clear = useCallback(() => {
    clearMut.mutate()
  }, [clearMut])

  return { assignment, save, clear, isLoading: allQuery.isLoading }
}
