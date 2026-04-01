import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface Organization {
    id: string
    name: string
    slug: string
}

interface OrgContextType {
    org: Organization | null
    isLoading: boolean
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
    const { profile, loading: authLoading } = useAuth()

    const { data: org, isLoading: queryLoading } = useQuery({
        queryKey: ['organization', profile?.org_id],
        queryFn: async () => {
            if (!profile?.org_id) return null
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, slug')
                .eq('id', profile.org_id)
                .single()
            if (error) throw error
            return data as Organization
        },
        enabled: !!profile?.org_id,
        staleTime: 30 * 60 * 1000, // 30 min — org metadata rarely changes
    })

    const isLoading = authLoading || queryLoading

    return (
        <OrgContext.Provider value={{ org: org ?? null, isLoading }}>
            {children}
        </OrgContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrg() {
    const context = useContext(OrgContext)
    if (context === undefined) {
        throw new Error('useOrg must be used within an OrgProvider')
    }
    return context
}
