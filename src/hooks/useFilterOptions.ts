import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'

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
    const { org } = useOrg()
    const activeOrgId = org?.id ?? null

    return useQuery({
        queryKey: ['pipeline-filter-options', activeOrgId],
        queryFn: async (): Promise<FilterOptions> => {
            if (!activeOrgId) {
                return { profiles: [], teams: [], departments: [] }
            }

            // Todas as tabelas per-org → filtrar por workspace ativo
            const [membersRes, teamsRes, deptsRes] = await Promise.all([
                // Profiles "de verdade" moram na account pai no multi-tenant;
                // usar org_members para listar membros do workspace.
                supabase
                    .from('org_members')
                    .select('user_id, profiles!inner(id, nome, email, team_id, active)')
                    .eq('org_id', activeOrgId),
                supabase
                    .from('teams')
                    .select('id, name, phase:pipeline_phases(slug)')
                    .eq('org_id', activeOrgId)
                    .order('name'),
                supabase
                    .from('departments')
                    .select('id, name')
                    .eq('org_id', activeOrgId)
                    .order('name'),
            ])

            if (membersRes.error) throw membersRes.error
            if (teamsRes.error) throw teamsRes.error
            if (deptsRes.error) throw deptsRes.error

            const teamsMap = new Map<string, { name: string; phaseSlug: string | null }>()
            for (const t of teamsRes.data || []) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phase = t.phase as any
                teamsMap.set(t.id, { name: t.name, phaseSlug: phase?.slug ?? null })
            }

            type MemberRow = {
                user_id: string
                profiles: { id: string; nome: string | null; email: string | null; team_id: string | null; active: boolean | null } | null
            }
            const rawMembers = (membersRes.data as unknown as MemberRow[]) || []

            const profiles: FilterProfile[] = rawMembers
                .filter(m => m.profiles && m.profiles.active !== false)
                .map(m => {
                    const p = m.profiles!
                    // Só considera team_id se o time pertencer ao workspace ativo.
                    const teamInfo = p.team_id ? teamsMap.get(p.team_id) : undefined
                    return {
                        id: p.id,
                        full_name: p.nome,
                        email: p.email,
                        team_id: teamInfo ? p.team_id : null,
                        team_name: teamInfo?.name ?? null,
                        phase_slug: teamInfo?.phaseSlug ?? null,
                    }
                })
                .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR'))

            return {
                profiles,
                teams: (teamsRes.data || []).map(t => ({ id: t.id, name: t.name })),
                departments: deptsRes.data || [],
            }
        },
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
        enabled: !!activeOrgId,
    })
}
