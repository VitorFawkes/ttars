import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export interface OrgBranding {
    primary_color?: string
    accent_color?: string
}

export interface OrgSettings {
    default_currency?: string
    timezone?: string
    date_format?: string
}

export interface Organization {
    id: string
    name: string
    slug: string
    logo_url: string | null
    branding: OrgBranding | null
    settings: OrgSettings | null
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
                .select('id, name, slug, logo_url, branding, settings')
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
