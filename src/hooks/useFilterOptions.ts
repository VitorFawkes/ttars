import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export interface FilterProfile {
    id: string
    full_name: string | null
    email: string | null
    team_id: string | null
    team_name: string | null
    phase_slug: string | null
}

export interface FilterOptions {
    profiles: FilterProfile[]
    teams: { id: string, name: string }[]
    departments: { id: string, name: string }[]
}

export function useFilterOptions() {
    const { profile } = useAuth()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeOrgId = (profile as any)?.active_org_id || profile?.org_id || null

    return useQuery({
        queryKey: ['pipeline-filter-options', activeOrgId],
        queryFn: async (): Promise<FilterOptions> => {
            const [profilesRes, teamsRes, deptsRes] = await Promise.all([
                supabase.from('profiles').select('id, nome, email, team_id').eq('active', true).order('nome'),
                supabase.from('teams').select('id, name, org_id, phase:pipeline_phases(slug)').order('name'),
                supabase.from('departments').select('id, name').order('name')
            ])

            if (profilesRes.error) throw profilesRes.error
            if (teamsRes.error) throw teamsRes.error
            if (deptsRes.error) throw deptsRes.error

            // Só teams da ORG ATIVA (cross-org polui a UI de filtros)
            const teamsInActiveOrg = (teamsRes.data || []).filter(t => !activeOrgId || t.org_id === activeOrgId)

            // Lookup de team → phase (só teams da org ativa, as parent não têm phase visível via RLS)
            const teamsMap = new Map<string, { name: string; phaseSlug: string | null }>()
            for (const t of teamsInActiveOrg) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phase = t.phase as any
                teamsMap.set(t.id, { name: t.name, phaseSlug: phase?.slug ?? null })
            }

            const profileIds = (profilesRes.data || []).map(p => p.id)

            // Resolve team da org ativa por usuário via team_members (cross-org aware)
            const userTeamMap = new Map<string, { team_id: string; team_name: string | null; phase_slug: string | null }>()
            if (profileIds.length > 0 && teamsInActiveOrg.length > 0) {
                const activeTeamIds = teamsInActiveOrg.map(t => t.id)
                const { data: tms } = await supabase
                    .from('team_members')
                    .select('user_id, team_id')
                    .in('user_id', profileIds)
                    .in('team_id', activeTeamIds)
                for (const row of tms || []) {
                    const info = teamsMap.get(row.team_id as string)
                    if (info && !userTeamMap.has(row.user_id as string)) {
                        userTeamMap.set(row.user_id as string, {
                            team_id: row.team_id as string,
                            team_name: info.name,
                            phase_slug: info.phaseSlug,
                        })
                    }
                }
            }

            const profiles: FilterProfile[] = (profilesRes.data || []).map(p => {
                const viaTm = userTeamMap.get(p.id)
                // Fallback: se não houver team_members, usa profile.team_id (mas phase vem null se parent)
                const viaLegacy = p.team_id ? teamsMap.get(p.team_id) : undefined
                return {
                    id: p.id,
                    full_name: p.nome,
                    email: p.email,
                    team_id: viaTm?.team_id ?? p.team_id ?? null,
                    team_name: viaTm?.team_name ?? viaLegacy?.name ?? null,
                    phase_slug: viaTm?.phase_slug ?? viaLegacy?.phaseSlug ?? null,
                }
            })

            return {
                profiles,
                teams: teamsInActiveOrg.map(t => ({ id: t.id, name: t.name })),
                departments: deptsRes.data || []
            }
        },
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false
    })
}
