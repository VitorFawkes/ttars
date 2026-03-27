import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
    return useQuery({
        queryKey: ['pipeline-filter-options'],
        queryFn: async (): Promise<FilterOptions> => {
            // Fetch all data in parallel
            const [profilesRes, teamsRes, deptsRes] = await Promise.all([
                supabase.from('profiles').select('id, nome, email, team_id').eq('active', true).order('nome'),
                supabase.from('teams').select('id, name, phase:pipeline_phases(slug)').order('name'),
                supabase.from('departments').select('id, name').order('name')
            ])

            if (profilesRes.error) throw profilesRes.error
            if (teamsRes.error) throw teamsRes.error
            if (deptsRes.error) throw deptsRes.error

            // Build teams lookup: team_id → { name, phaseSlug }
            const teamsMap = new Map<string, { name: string; phaseSlug: string | null }>()
            for (const t of teamsRes.data || []) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phase = t.phase as any
                teamsMap.set(t.id, { name: t.name, phaseSlug: phase?.slug ?? null })
            }

            // Map profiles with team and phase info
            const profiles: FilterProfile[] = (profilesRes.data || []).map(p => {
                const team = p.team_id ? teamsMap.get(p.team_id) : undefined
                return {
                    id: p.id,
                    full_name: p.nome,
                    email: p.email,
                    team_id: p.team_id,
                    team_name: team?.name ?? null,
                    phase_slug: team?.phaseSlug ?? null,
                }
            })

            return {
                profiles,
                teams: (teamsRes.data || []).map(t => ({ id: t.id, name: t.name })),
                departments: deptsRes.data || []
            }
        },
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false
    })
}
