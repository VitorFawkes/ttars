import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Retorna os IDs das fases que o usuário logado pode ver no pipeline.
 * - Inclui a fase do time do usuário + fases configuradas em phase_visibility_rules
 * - Admin: retorna null (sem filtro, vê tudo)
 * - Sem time: retorna null (sem filtro)
 */
export function useMyVisiblePhases() {
    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    return useQuery({
        queryKey: ['my-visible-phases', profile?.team_id, isAdmin],
        enabled: !!profile?.team_id && !isAdmin,
        queryFn: async () => {
            if (!profile?.team_id) return null

            // Busca a fase do time do usuário
            const { data: teamData, error: teamError } = await supabase
                .from('teams')
                .select('phase_id')
                .eq('id', profile.team_id)
                .single()

            if (teamError || !teamData?.phase_id) return null

            const myPhaseId = teamData.phase_id

            // Busca fases adicionais configuradas
            // Tabela nova — ainda não está em database.types.ts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: rules, error: rulesError } = await (supabase as any)
                .from('phase_visibility_rules')
                .select('target_phase_id')
                .eq('source_phase_id', myPhaseId)

            if (rulesError) throw rulesError

            const extraPhaseIds = (rules || []).map((r: { target_phase_id: string }) => r.target_phase_id)
            return [myPhaseId, ...extraPhaseIds]
        },
        staleTime: 10 * 60 * 1000
    })
}
