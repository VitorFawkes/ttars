import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { OrgBranding } from '../contexts/OrgContext'

export interface OrgMembership {
    org_id: string
    org_name: string
    org_slug: string
    role: string
    is_default: boolean
    branding: OrgBranding | null
}

export function useOrgMembers() {
    const { user } = useAuth()

    const query = useQuery({
        queryKey: ['org-members', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_members' as never)
                .select('org_id, role, is_default, org:organizations(id, name, slug, branding)')
                .eq('user_id', user!.id)
                .order('is_default', { ascending: false })

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data as any[])
                .filter((d) => d.org?.id)
                .map((d): OrgMembership => ({
                    org_id: d.org.id,
                    org_name: d.org.name,
                    org_slug: d.org.slug,
                    role: d.role,
                    is_default: d.is_default,
                    branding: d.org.branding,
                }))
        },
        enabled: !!user?.id,
        staleTime: 10 * 60 * 1000,
    })

    return {
        orgs: query.data ?? [],
        isLoading: query.isLoading,
    }
}
