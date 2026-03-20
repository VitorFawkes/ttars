import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Retorna os IDs dos cards onde o usuário logado é membro da equipe
 * (assistente_planner, assistente_pos, apoio) mas NÃO é dono_atual.
 * Usado pelo SubView MY_ASSISTS no pipeline.
 */
export function useMyAssistCardIds(enabled: boolean) {
    const { session } = useAuth()

    return useQuery({
        queryKey: ['my-assist-card-ids', session?.user?.id],
        enabled: enabled && !!session?.user?.id,
        queryFn: async () => {
            if (!session?.user?.id) return []

            const { data, error } = await supabase
                .from('card_team_members')
                .select('card_id')
                .eq('profile_id', session.user.id)

            if (error) throw error
            return (data || []).map(d => d.card_id)
        },
        staleTime: 1000 * 30, // 30s — revalidar frequentemente
    })
}
