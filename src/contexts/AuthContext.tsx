import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { setSentryUser } from '../lib/sentry'
import type { Database } from '../database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

// Enriquecido com joins de team+phase e role_info para evitar queries extras
type Profile = ProfileRow & {
    team?: {
        id: string
        name: string
        phase_id: string | null
        phase: { id: string; name: string; slug: string; color: string; order_index: number } | null
    } | null
    role_info?: {
        id: string
        name: string
        display_name: string
        color: string | null
    } | null
}

interface AuthContextType {
    user: User | null
    session: Session | null
    profile: Profile | null
    loading: boolean
    authError: string | null
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState<string | null>(null)

    useEffect(() => {
        let resolved = false

        // Safety timeout: se getSession() não resolver em 10s, forçar loading=false
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true
                console.error('AuthContext: timeout — Supabase não respondeu em 10s')
                setAuthError('Não foi possível conectar ao servidor. Verifique sua conexão.')
                setLoading(false)
            }
        }, 10_000)

        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (resolved) return
            resolved = true
            clearTimeout(timeout)
            setAuthError(null)
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setLoading(false)
            }
        }).catch((error) => {
            if (resolved) return
            resolved = true
            clearTimeout(timeout)
            console.error('AuthContext: Erro ao buscar sessão:', error)
            setAuthError('Erro de conexão com o servidor. Tente novamente.')
            setLoading(false)
        })

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                // Marcar timestamp de login ao fazer sign in
                if (event === 'SIGNED_IN') {
                    localStorage.setItem('welcomecrm_last_login_ts', new Date().toISOString())
                }
                fetchProfile(session.user.id)
            } else {
                setProfile(null)
                setLoading(false)
            }
        })

        return () => {
            clearTimeout(timeout)
            subscription.unsubscribe()
        }
    }, [])

    async function fetchProfile(userId: string) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    *,
                    team:teams!profiles_team_id_fkey(id, name, phase_id,
                        phase:pipeline_phases(id, name, slug, color, order_index)
                    ),
                    role_info:roles(id, name, display_name, color)
                `)
                .eq('id', userId)
                .single()

            if (error) {
                console.error('Erro ao buscar profile:', error)
            } else {
                const p = data as Profile
                setProfile(p)
                // Sentry: associa user + org ao escopo de erros
                setSentryUser({ id: p.id, email: p.email ?? undefined, org_id: p.org_id ?? undefined })
            }
        } catch (error) {
            console.error('Erro inesperado ao buscar profile:', error)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setSession(null)
        setProfile(null)
        setSentryUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, authError, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
