import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Resolve teamIds para member profile IDs via RPC server-side.
 * Usado pelos hooks de pipeline (kanban + lista) para filtrar cards por time.
 */
export function useTeamFilterMembers(teamIds?: string[]) {
    return useQuery({
        queryKey: ['team-filter-members', teamIds],
        enabled: (teamIds?.length ?? 0) > 0,
        queryFn: async () => {
            if (!teamIds?.length) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC criada em migration pendente, types serão regenerados após deploy
            const { data, error } = await (supabase.rpc as any)('get_team_member_ids', {
                p_team_ids: teamIds
            })
            if (error) throw error
            return (data ?? []) as string[]
        },
        staleTime: 5 * 60 * 1000
    })
}
