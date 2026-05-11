import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ContactNameInfo {
    nome: string
    role: 'primary' | 'traveler'
}

/**
 * Fetches contact names and roles for a card (primary + travelers from cards_contatos).
 * Returns a map of contactId → { nome, role }.
 */
export function useCardContactNames(cardId: string | null) {
    return useQuery({
        queryKey: ['card-contact-names', cardId],
        queryFn: async (): Promise<Record<string, ContactNameInfo>> => {
            if (!cardId) return {}

            // 1. Get primary contact from card
            const { data: card } = await supabase
                .from('cards')
                .select('pessoa_principal_id, contatos!cards_pessoa_principal_id_fkey(id, nome, sobrenome)')
                .eq('id', cardId)
                .single()

            const map: Record<string, ContactNameInfo> = {}

            if (card?.contatos) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const c = card.contatos as any
                const nome = [c.nome, c.sobrenome].filter(Boolean).join(' ').trim() || 'Titular'
                map[c.id] = { nome, role: 'primary' }
            }

            // 2. Get travelers from cards_contatos
            const { data: travelers } = await supabase
                .from('cards_contatos')
                .select('contato_id, contatos(id, nome, sobrenome)')
                .eq('card_id', cardId)

            if (travelers) {
                for (const t of travelers) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const c = t.contatos as any
                    if (!c?.id || map[c.id]) continue // skip if already primary
                    const nome = [c.nome, c.sobrenome].filter(Boolean).join(' ').trim() || 'Acompanhante'
                    map[c.id] = { nome, role: 'traveler' }
                }
            }

            return map
        },
        enabled: !!cardId,
        staleTime: 1000 * 60 * 5, // 5 min
    })
}
