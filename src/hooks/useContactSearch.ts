import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDebouncedValue } from './useDebouncedValue'

export interface ContactSearchResult {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
    telefone_normalizado: string | null
    cpf_normalizado: string | null
    empresa_id: string | null
    monde_person_id: string | null
    tipo_contato: string | null
    match_score: number
}

interface Options {
    limit?: number
    enabled?: boolean
    debounceMs?: number
}

/**
 * Busca tolerante de contatos (tolera typos, letras dobradas e acento).
 * Substring exato vence fuzzy no ranking.
 * RLS aplica — só retorna contatos visíveis ao usuário (workspace + account conforme sharing).
 */
export function useContactSearch(term: string, options: Options = {}) {
    const debounced = useDebouncedValue(term, options.debounceMs ?? 300)
    const trimmed = debounced.trim()
    const limit = options.limit ?? 20
    const enabled = (options.enabled ?? true) && trimmed.length >= 2

    return useQuery({
        queryKey: ['contact-search', trimmed, limit],
        queryFn: async (): Promise<ContactSearchResult[]> => {
            const { data, error } = await (supabase.rpc as any)('search_contatos', {
                p_term: trimmed,
                p_limit: limit,
            })
            if (error) throw error
            return (data ?? []) as ContactSearchResult[]
        },
        enabled,
        staleTime: 30_000,
    })
}
