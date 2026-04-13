import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Retorna os IDs das fases que o usuário logado pode ver no pipeline.
 * - Inclui a fase do time do usuário na ORG ATIVA + fases configuradas em phase_visibility_rules
 * - Admin: retorna null (sem filtro, vê tudo)
 * - Sem time: retorna null (sem filtro)
 *
 * Cross-org: usa team_members para encontrar a team do usuário na org ativa
 * (após Org Split, cada org-filha tem suas próprias teams homônimas).
 */
export function useMyVisiblePhases() {
    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeOrgId = (profile as any)?.active_org_id || profile?.org_id || null

    return useQuery({
        queryKey: ['my-visible-phases', profile?.id, profile?.team_id, activeOrgId, isAdmin],
        enabled: !!profile && !isAdmin,
        queryFn: async () => {
            if (!profile) return null

            // 1) Procurar team do usuário na org ativa via team_members
            //    (cross-org: cada org-filha tem team homônima)
            let myPhaseId: string | null = null

            if (activeOrgId) {
                // Filtrar diretamente por team.org_id na query (não no client)
                const { data: tmRows } = await supabase
                    .from('team_members')
                    .select('team:teams!inner(id, phase_id, org_id)')
                    .eq('user_id', profile.id)
                    .eq('team.org_id', activeOrgId)
                if (tmRows && tmRows.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const match = tmRows.find((r: any) => r.team?.phase_id)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    myPhaseId = (match as any)?.team?.phase_id || null
                }
            }

            // 2) Fallback: profile.team_id (comportamento antigo)
            if (!myPhaseId && profile.team_id) {
                const { data: teamData } = await supabase
                    .from('teams')
                    .select('phase_id')
                    .eq('id', profile.team_id)
                    .single()
                myPhaseId = teamData?.phase_id || null
            }

            if (!myPhaseId) return null

            // 3) Fases adicionais configuradas
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
