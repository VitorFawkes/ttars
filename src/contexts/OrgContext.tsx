import { createContext, useContext, useEffect, type ReactNode } from 'react'
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
    onboarding_step: number
    onboarding_completed_at: string | null
    force_relogin_after: string | null
}

interface OrgContextType {
    org: Organization | null
    isLoading: boolean
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

const FORCE_RELOGIN_KEY = 'welcomecrm_last_login_ts'

export function OrgProvider({ children }: { children: ReactNode }) {
    const { profile, user, signOut, loading: authLoading } = useAuth()

    // Marcar timestamp de login se ainda não existir (sessões pré-existentes)
    useEffect(() => {
        if (user && !localStorage.getItem(FORCE_RELOGIN_KEY)) {
            localStorage.setItem(FORCE_RELOGIN_KEY, new Date().toISOString())
        }
    }, [user])

    const { data: org, isLoading: queryLoading } = useQuery({
        queryKey: ['organization', profile?.org_id],
        queryFn: async () => {
            if (!profile?.org_id) return null
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, slug, logo_url, branding, settings, onboarding_step, onboarding_completed_at, force_relogin_after')
                .eq('id', profile.org_id)
                .single()
            if (error) throw error
            return data as unknown as Organization
        },
        enabled: !!profile?.org_id,
        staleTime: 30 * 60 * 1000, // 30 min — org metadata rarely changes
    })

    // Verificar se admin forçou re-login
    useEffect(() => {
        if (!org?.force_relogin_after || !user) return

        const forceAfter = new Date(org.force_relogin_after).getTime()
        const loginTs = localStorage.getItem(FORCE_RELOGIN_KEY)
        const lastLogin = loginTs ? new Date(loginTs).getTime() : 0

        if (lastLogin < forceAfter) {
            // Sessão é anterior ao force_relogin — deslogar
            localStorage.removeItem(FORCE_RELOGIN_KEY)
            signOut()
        }
    }, [org?.force_relogin_after, user, signOut])

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
