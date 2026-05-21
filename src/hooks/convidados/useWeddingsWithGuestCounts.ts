import { useMemo } from 'react'
import { useWeddings } from './useWeddings'
import { useAllGuests } from './useAllGuests'
import { useFluxoTemplates } from './useFluxoConfig'
import { useAllWeddingFluxos } from './useWeddingFluxo'
import { computeDisplayedEtapa } from './displayedEtapa'
import type { Guest, RsvpCounts, WeddingWithGuests } from './types'

const ZERO_COUNTS: RsvpCounts = { nao_vai: 0, sem_reacao: 0, intencao: 0, confirmado: 0, total: 0 }

export function useWeddingsWithGuestCounts() {
  const weddingsQuery = useWeddings()
  const guestsQuery = useAllGuests({ search: '', statusFilter: [], weddingFilter: [] })
  const { data: flows = [] } = useFluxoTemplates()
  const { data: assignmentStore = {} } = useAllWeddingFluxos()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const data = useMemo<WeddingWithGuests[]>(() => {
    const weddings = weddingsQuery.data ?? []
    const allGuests = guestsQuery.data ?? []

    const byCard = new Map<string, Guest[]>()
    for (const g of allGuests) {
      const list = byCard.get(g.card_id) ?? []
      list.push(g)
      byCard.set(g.card_id, list)
    }

    return weddings.map(w => {
      const guests = byCard.get(w.id) ?? []
      const counts: RsvpCounts = guests.reduce((acc, g) => {
        acc[g.status_rsvp] += 1
        acc.total += 1
        return acc
      }, { ...ZERO_COUNTS })

      const assignment = assignmentStore[w.id] ?? null
      const fluxo = assignment ? flows.find(f => f.id === assignment.fluxoId) ?? null : null
      const etapa = computeDisplayedEtapa(w.etapa, assignment, fluxo, today)

      return { ...w, etapa, guests, counts }
    })
  }, [weddingsQuery.data, guestsQuery.data, today, assignmentStore, flows])

  return {
    data,
    isLoading: weddingsQuery.isLoading || guestsQuery.isLoading,
    isError: weddingsQuery.isError || guestsQuery.isError,
    error: weddingsQuery.error || guestsQuery.error,
    refetch: async () => {
      await Promise.all([weddingsQuery.refetch(), guestsQuery.refetch()])
    },
  }
}
