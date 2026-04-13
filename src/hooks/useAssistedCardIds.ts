import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AssistedMembershipMap {
    /** Todos os card_ids onde qualquer um dos userIds é membro */
    allCardIds: string[]
    /** Mapa user_id → card_ids[] */
    byUser: Record<string, string[]>
}

/**
 * Retorna mapeamento de card_ids → user_ids via card_team_members
 * (assistente_planner, assistente_pos, apoio). Usado para expandir filtros
 * por pessoa no pipeline: gestor ao filtrar por X vê tanto cards onde X é
 * dono quanto cards onde X é apoio/assistente.
 */
export function useAssistedCardIds(userIds: string[] | undefined) {
    const uniqueIds = Array.from(new Set(userIds || [])).sort()
    const enabled = uniqueIds.length > 0
    const key = uniqueIds.join(',')

    return useQuery<AssistedMembershipMap>({
        queryKey: ['assisted-card-ids', key],
        enabled,
        queryFn: async () => {
            if (!enabled) return { allCardIds: [], byUser: {} }
            const { data, error } = await supabase
                .from('card_team_members')
                .select('card_id, profile_id')
                .in('profile_id', uniqueIds)
            if (error) throw error
            const byUser: Record<string, string[]> = {}
            const allSet = new Set<string>()
            for (const r of data || []) {
                const cid = r.card_id as string
                const uid = r.profile_id as string
                if (!byUser[uid]) byUser[uid] = []
                byUser[uid].push(cid)
                allSet.add(cid)
            }
            return { allCardIds: Array.from(allSet), byUser }
        },
        staleTime: 30 * 1000,
    })
}

/** Retorna union de card_ids para um subset de userIds do mapping carregado. */
export function cardsAssistedByAny(map: AssistedMembershipMap | undefined, userIds: string[] | undefined): string[] {
    if (!map || !userIds?.length) return []
    const out = new Set<string>()
    for (const uid of userIds) {
        const list = map.byUser[uid]
        if (list) for (const c of list) out.add(c)
    }
    return Array.from(out)
}
