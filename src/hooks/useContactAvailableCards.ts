import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AvailableCard {
    id: string
    titulo: string
    produto: string | null
    role: 'primary' | 'traveler'
    /** True se já existe presente do contato neste card */
    hasGift: boolean
}

/**
 * Para cada contato em `contatoIds`, retorna os cards em que ele aparece
 * (como pessoa principal OU viajante) e indica se já tem presente atribuído.
 * Usado no fluxo "Novo Presente" pra oferecer vincular o presente a uma viagem existente.
 */
export function useContactAvailableCards(contatoIds: string[]) {
    const ids = [...new Set(contatoIds.filter(Boolean))].sort()

    return useQuery({
        queryKey: ['contact-available-cards', ids],
        queryFn: async () => {
            if (ids.length === 0) return {} as Record<string, AvailableCard[]>

            // 1. Cards onde o contato é PRIMARY
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: primaryCards, error: e1 } = await (supabase as any)
                .from('cards')
                .select('id, titulo, produto, pessoa_principal_id')
                .in('pessoa_principal_id', ids)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
            if (e1) throw e1

            // 2. Cards onde o contato é TRAVELER
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: travelerLinks, error: e2 } = await (supabase as any)
                .from('cards_contatos')
                .select('contato_id, card:cards!inner(id, titulo, produto, deleted_at)')
                .in('contato_id', ids)
            if (e2) throw e2

            // 3. Quais (card_id, contato_id) já têm presente?
            const allCardIds = new Set<string>()
            ;(primaryCards || []).forEach((c: { id: string }) => allCardIds.add(c.id))
            ;(travelerLinks || []).forEach((l: { card: { id: string } }) => l.card?.id && allCardIds.add(l.card.id))

            let existingGifts: { card_id: string; contato_id: string }[] = []
            if (allCardIds.size > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: gifts, error: e3 } = await (supabase as any)
                    .from('card_gift_assignments')
                    .select('card_id, contato_id')
                    .in('card_id', Array.from(allCardIds))
                    .in('contato_id', ids)
                    .neq('status', 'cancelado')
                if (e3) throw e3
                existingGifts = (gifts || []) as { card_id: string; contato_id: string }[]
            }
            const giftKey = (cardId: string, contatoId: string) => `${cardId}|${contatoId}`
            const giftSet = new Set(existingGifts.map(g => giftKey(g.card_id, g.contato_id)))

            // 4. Construir o mapa final
            const result: Record<string, AvailableCard[]> = {}
            for (const id of ids) result[id] = []

            for (const c of (primaryCards || []) as { id: string; titulo: string; produto: string | null; pessoa_principal_id: string }[]) {
                result[c.pessoa_principal_id]?.push({
                    id: c.id,
                    titulo: c.titulo,
                    produto: c.produto,
                    role: 'primary',
                    hasGift: giftSet.has(giftKey(c.id, c.pessoa_principal_id)),
                })
            }

            for (const link of (travelerLinks || []) as { contato_id: string; card: { id: string; titulo: string; produto: string | null; deleted_at: string | null } | null }[]) {
                if (!link.card || link.card.deleted_at) continue
                // Evita duplicar se já entrou como primary
                const existing = result[link.contato_id]?.find(c => c.id === link.card!.id)
                if (existing) continue
                result[link.contato_id]?.push({
                    id: link.card.id,
                    titulo: link.card.titulo,
                    produto: link.card.produto,
                    role: 'traveler',
                    hasGift: giftSet.has(giftKey(link.card.id, link.contato_id)),
                })
            }

            return result
        },
        enabled: ids.length > 0,
        staleTime: 1000 * 30,
    })
}
