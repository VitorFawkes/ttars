import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface ResponsavelOption {
    id: string
    nome: string | null
    email: string | null
    avatar_url: string | null
}

export interface LossReasonOption {
    id: string
    nome: string
}

export function useReactivationFacets() {
    const [destinations, setDestinations] = useState<string[]>([])
    const [responsaveis, setResponsaveis] = useState<ResponsavelOption[]>([])
    const [lossReasons, setLossReasons] = useState<LossReasonOption[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            try {
                const [destRes, respRes, lossRes] = await Promise.all([
                    db.from('reactivation_patterns').select('last_destinations').limit(1000),
                    db.from('reactivation_patterns')
                        .select('last_responsavel_id, responsavel:profiles!last_responsavel_id(id, nome, email, avatar_url)')
                        .not('last_responsavel_id', 'is', null)
                        .limit(500),
                    db.from('motivos_perda').select('id, nome').eq('ativo', true).order('nome', { ascending: true }),
                ])

                if (cancelled) return

                const destSet = new Set<string>()
                ;(destRes.data as { last_destinations: string[] | null }[] | null)?.forEach(row => {
                    row.last_destinations?.forEach(d => { if (d) destSet.add(d) })
                })
                setDestinations(Array.from(destSet).sort())

                const respMap = new Map<string, ResponsavelOption>()
                ;(respRes.data as { responsavel: ResponsavelOption | null }[] | null)?.forEach(row => {
                    if (row.responsavel && !respMap.has(row.responsavel.id)) {
                        respMap.set(row.responsavel.id, row.responsavel)
                    }
                })
                setResponsaveis(
                    Array.from(respMap.values()).sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))
                )

                setLossReasons(((lossRes.data as LossReasonOption[] | null) ?? []))
            } catch (err) {
                console.error('Error loading reactivation facets:', err)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [])

    return { destinations, responsaveis, lossReasons, loading }
}
