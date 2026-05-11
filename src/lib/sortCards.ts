import type { Database } from '../database.types'
import type { SortBy, SortDirection } from '../hooks/usePipelineFilters'

type Card = Database['public']['Views']['view_cards_acoes']['Row']

/**
 * Ordena um array de cards client-side pelo campo e direção fornecidos.
 * Nulls são sempre empurrados para o final independente da direção.
 */
export function sortCards(cards: Card[], sortBy: SortBy, sortDirection: SortDirection): Card[] {
    if (cards.length <= 1) return cards

    const dir = sortDirection === 'asc' ? 1 : -1

    return [...cards].sort((a, b) => {
        switch (sortBy) {
            case 'titulo': {
                const aVal = a.titulo || ''
                const bVal = b.titulo || ''
                return dir * aVal.localeCompare(bVal, 'pt-BR')
            }

            case 'valor_estimado': {
                const aVal = a.valor_estimado
                const bVal = b.valor_estimado
                if (aVal == null && bVal == null) return 0
                if (aVal == null) return 1
                if (bVal == null) return -1
                return dir * (aVal - bVal)
            }

            case 'dias_ate_viagem': {
                const aVal = a.dias_ate_viagem
                const bVal = b.dias_ate_viagem
                if (aVal == null && bVal == null) return 0
                if (aVal == null) return 1
                if (bVal == null) return -1
                return dir * (aVal - bVal)
            }

            case 'tempo_etapa_dias': {
                const aVal = a.tempo_etapa_dias
                const bVal = b.tempo_etapa_dias
                if (aVal == null && bVal == null) return 0
                if (aVal == null) return 1
                if (bVal == null) return -1
                return dir * (aVal - bVal)
            }

            case 'data_proxima_tarefa': {
                const aDate = (a.proxima_tarefa as Record<string, unknown>)?.data_vencimento as string | undefined
                const bDate = (b.proxima_tarefa as Record<string, unknown>)?.data_vencimento as string | undefined
                if (!aDate && !bDate) return 0
                if (!aDate) return 1
                if (!bDate) return -1
                return dir * aDate.localeCompare(bDate)
            }

            default: {
                // Campos de data/timestamp: created_at, updated_at, data_viagem_inicio, data_fechamento
                const aVal = (a as Record<string, unknown>)[sortBy] as string | null | undefined
                const bVal = (b as Record<string, unknown>)[sortBy] as string | null | undefined
                if (!aVal && !bVal) return 0
                if (!aVal) return 1
                if (!bVal) return -1
                return dir * aVal.localeCompare(bVal)
            }
        }
    })
}
