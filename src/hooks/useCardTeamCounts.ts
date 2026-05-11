import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Busca o count de team members por card_id em uma única query global.
 * A tabela card_team_members é pequena, então buscar tudo é mais eficiente
 * do que N queries individuais (uma por KanbanCard).
 *
 * Retorna um Map<card_id, count> para lookup O(1).
 */
export function useCardTeamCounts() {
    const { data: countsMap } = useQuery({
        queryKey: ['card-team-counts-global'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_team_members')
                .select('card_id')

            if (error) return new Map<string, number>()

            const map = new Map<string, number>()
            for (const row of data || []) {
                map.set(row.card_id, (map.get(row.card_id) || 0) + 1)
            }
            return map
        },
        staleTime: 1000 * 60 * 2, // 2 min cache
    })

    return countsMap || new Map<string, number>()
}
