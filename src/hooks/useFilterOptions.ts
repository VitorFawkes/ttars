import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface FilterOptions {
    profiles: { id: string, full_name: string | null, email: string | null }[]
    teams: { id: string, name: string }[]
    departments: { id: string, name: string }[]
}

export function useFilterOptions() {
    return useQuery({
        queryKey: ['pipeline-filter-options'],
        queryFn: async (): Promise<FilterOptions> => {
            // Fetch all data in parallel
            const [profilesRes, teamsRes, deptsRes] = await Promise.all([
                supabase.from('profiles').select('id, nome, email').eq('active', true).order('nome'),
                supabase.from('teams').select('id, name').order('name'),
                supabase.from('departments').select('id, name').order('name')
            ])

            if (profilesRes.error) throw profilesRes.error
            if (teamsRes.error) throw teamsRes.error
            if (deptsRes.error) throw deptsRes.error

            // Map profiles to match expected interface
            const profiles = (profilesRes.data || []).map(p => ({
                id: p.id,
                full_name: p.nome, // Map 'nome' to 'full_name'
                email: p.email
            }))

            return {
                profiles,
                teams: teamsRes.data || [],
                departments: deptsRes.data || []
            }
        },
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
        refetchOnWindowFocus: false
    })
}
