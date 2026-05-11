import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface DuplicateMatch {
    match_type: 'cpf' | 'email' | 'telefone' | 'nome'
    match_strength: 'exact' | 'normalized' | 'fuzzy'
    contact_id: string
    contact_nome: string | null
    contact_sobrenome: string | null
    contact_email: string | null
    contact_telefone: string | null
    contact_cpf: string | null
}

interface DuplicateDetectionInput {
    cpf?: string | null
    email?: string | null
    telefone?: string | null
    nome?: string | null
    sobrenome?: string | null
}

interface UseDuplicateDetectionOptions {
    excludeId?: string
    debounceMs?: number
    enabled?: boolean
}

const MATCH_PRIORITY: Record<string, number> = { cpf: 0, email: 1, telefone: 2, nome: 3 }

function deduplicateResults(results: DuplicateMatch[]): DuplicateMatch[] {
    const map = new Map<string, DuplicateMatch>()
    for (const r of results) {
        const existing = map.get(r.contact_id)
        if (!existing || (MATCH_PRIORITY[r.match_type] ?? 99) < (MATCH_PRIORITY[existing.match_type] ?? 99)) {
            map.set(r.contact_id, r)
        }
    }
    return Array.from(map.values()).sort(
        (a, b) => (MATCH_PRIORITY[a.match_type] ?? 99) - (MATCH_PRIORITY[b.match_type] ?? 99)
    )
}

export function useDuplicateDetection(
    input: DuplicateDetectionInput,
    options: UseDuplicateDetectionOptions = {}
) {
    const { excludeId, debounceMs = 250, enabled = true } = options
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
    const [isChecking, setIsChecking] = useState(false)
    const [hasChecked, setHasChecked] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    const hasSearchableInput = useCallback((): boolean => {
        const cpfDigits = (input.cpf || '').replace(/\D/g, '')
        if (cpfDigits.length >= 5) return true

        const email = (input.email || '').trim()
        if (email.includes('@') && email.length >= 3) return true

        const phoneDigits = (input.telefone || '').replace(/\D/g, '')
        if (phoneDigits.length >= 6) return true

        const nome = (input.nome || '').trim()
        const sobrenome = (input.sobrenome || '').trim()
        if (nome.length >= 2 && sobrenome.length >= 2) return true

        return false
    }, [input.cpf, input.email, input.telefone, input.nome, input.sobrenome])

    const checkDuplicates = useCallback(async () => {
        if (!enabled || !hasSearchableInput()) {
            setDuplicates([])
            return
        }

        setIsChecking(true)
        setHasChecked(false)

        try {
            // RPC ainda não está nos types gerados — cast para any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.rpc as any)('check_contact_duplicates', {
                p_cpf: input.cpf || null,
                p_email: input.email || null,
                p_telefone: input.telefone || null,
                p_nome: input.nome || null,
                p_sobrenome: input.sobrenome || null,
                p_exclude_id: excludeId || null,
            })

            if (!mountedRef.current) return

            if (error) {
                console.error('Duplicate check RPC error:', error)
                setDuplicates([])
                return
            }

            setDuplicates(deduplicateResults((data as DuplicateMatch[]) || []))
        } catch (err) {
            console.error('Duplicate check failed:', err)
            if (mountedRef.current) setDuplicates([])
        } finally {
            if (mountedRef.current) {
                setIsChecking(false)
                setHasChecked(true)
            }
        }
    }, [input.cpf, input.email, input.telefone, input.nome, input.sobrenome, excludeId, enabled, hasSearchableInput])

    // Debounced effect
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current)

        if (!enabled || !hasSearchableInput()) {
            setDuplicates([])
            setHasChecked(false)
            return
        }

        timerRef.current = setTimeout(checkDuplicates, debounceMs)
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [checkDuplicates, debounceMs, enabled, hasSearchableInput])

    const hasDuplicates = duplicates.length > 0
    const highConfidenceDuplicates = duplicates.filter(d =>
        d.match_type === 'cpf' || d.match_type === 'email'
    )
    const hasHighConfidenceDuplicate = highConfidenceDuplicates.length > 0
    const noDuplicatesFound = hasChecked && duplicates.length === 0

    const clearDuplicates = useCallback(() => setDuplicates([]), [])

    return {
        duplicates,
        isChecking,
        hasDuplicates,
        hasHighConfidenceDuplicate,
        highConfidenceDuplicates,
        clearDuplicates,
        hasChecked,
        noDuplicatesFound,
    }
}
