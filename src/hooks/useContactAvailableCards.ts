import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AvailableCardTraveler {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
    role: 'primary' | 'traveler'
    /** Já tem presente neste card (qualquer status exceto cancelado). */
    hasGift: boolean
}

export interface AvailableCard {
    id: string
    titulo: string
    produto: string | null
    dataInicio: string | null
    dataFim: string | null
    role: 'primary' | 'traveler'
    /** True se já existe presente do contato selecionado neste card */
    hasGift: boolean
    /** Outras pessoas no card (exclui o contato que fez a busca) */
    travelers: AvailableCardTraveler[]
}

/**
 * Para cada contato em `contatoIds`, retorna os cards em que ele aparece
 * (como pessoa principal OU viajante), com datas da viagem e os co-viajantes
 * (com info de se cada um já tem presente naquele card).
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
                .select('id, titulo, produto, pessoa_principal_id, data_viagem_inicio, data_viagem_fim')
                .in('pessoa_principal_id', ids)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
            if (e1) throw e1

            // 2. Cards onde o contato é TRAVELER
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: travelerLinks, error: e2 } = await (supabase as any)
                .from('cards_contatos')
                .select('contato_id, card:cards!inner(id, titulo, produto, pessoa_principal_id, data_viagem_inicio, data_viagem_fim, deleted_at)')
                .in('contato_id', ids)
            if (e2) throw e2

            // 3. Agrupa todos os cards únicos
            const cardMap = new Map<string, { id: string; titulo: string; produto: string | null; pessoa_principal_id: string | null; data_viagem_inicio: string | null; data_viagem_fim: string | null }>()
            for (const c of (primaryCards || []) as { id: string; titulo: string; produto: string | null; pessoa_principal_id: string; data_viagem_inicio: string | null; data_viagem_fim: string | null }[]) {
                cardMap.set(c.id, c)
            }
            for (const link of (travelerLinks || []) as { contato_id: string; card: { id: string; titulo: string; produto: string | null; pessoa_principal_id: string | null; data_viagem_inicio: string | null; data_viagem_fim: string | null; deleted_at: string | null } | null }[]) {
                if (!link.card || link.card.deleted_at) continue
                if (!cardMap.has(link.card.id)) {
                    cardMap.set(link.card.id, {
                        id: link.card.id,
                        titulo: link.card.titulo,
                        produto: link.card.produto,
                        pessoa_principal_id: link.card.pessoa_principal_id,
                        data_viagem_inicio: link.card.data_viagem_inicio,
                        data_viagem_fim: link.card.data_viagem_fim,
                    })
                }
            }

            const allCardIds = Array.from(cardMap.keys())
            if (allCardIds.length === 0) {
                const empty: Record<string, AvailableCard[]> = {}
                for (const id of ids) empty[id] = []
                return empty
            }

            // 4. Todos os viajantes (tabela de junção) pra cada card
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: allTravelerLinks, error: e3 } = await (supabase as any)
                .from('cards_contatos')
                .select('card_id, contato_id, contato:contatos(id, nome, sobrenome, email, telefone)')
                .in('card_id', allCardIds)
            if (e3) throw e3

            // 5. Todos os primaries que importam (pode ter cards sem primary)
            const primaryContactIds = Array.from(cardMap.values())
                .map(c => c.pessoa_principal_id)
                .filter((v): v is string => !!v)
            let primariesInfo: Record<string, { id: string; nome: string; sobrenome: string | null; email: string | null; telefone: string | null }> = {}
            if (primaryContactIds.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: primariesData, error: e4 } = await (supabase as any)
                    .from('contatos')
                    .select('id, nome, sobrenome, email, telefone')
                    .in('id', primaryContactIds)
                if (e4) throw e4
                primariesInfo = Object.fromEntries((primariesData || []).map((p: { id: string }) => [p.id, p]))
            }

            // 6. Presentes existentes (card_id, contato_id) pra marcar hasGift
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: gifts, error: e5 } = await (supabase as any)
                .from('card_gift_assignments')
                .select('card_id, contato_id')
                .in('card_id', allCardIds)
                .neq('status', 'cancelado')
            if (e5) throw e5
            const giftKey = (cardId: string, contatoId: string) => `${cardId}|${contatoId}`
            const giftSet = new Set(((gifts || []) as { card_id: string; contato_id: string }[]).map(g => giftKey(g.card_id, g.contato_id)))

            // 7. Monta mapa de travelers por card (inclui primary)
            const travelersByCard = new Map<string, AvailableCardTraveler[]>()
            for (const card of cardMap.values()) {
                const list: AvailableCardTraveler[] = []
                // Primary
                if (card.pessoa_principal_id && primariesInfo[card.pessoa_principal_id]) {
                    const p = primariesInfo[card.pessoa_principal_id]
                    list.push({
                        id: p.id,
                        nome: p.nome,
                        sobrenome: p.sobrenome,
                        email: p.email,
                        telefone: p.telefone,
                        role: 'primary',
                        hasGift: giftSet.has(giftKey(card.id, p.id)),
                    })
                }
                travelersByCard.set(card.id, list)
            }
            for (const link of (allTravelerLinks || []) as { card_id: string; contato_id: string; contato: { id: string; nome: string; sobrenome: string | null; email: string | null; telefone: string | null } | null }[]) {
                if (!link.contato) continue
                const arr = travelersByCard.get(link.card_id)
                if (!arr) continue
                if (arr.find(t => t.id === link.contato!.id)) continue // já como primary
                arr.push({
                    id: link.contato.id,
                    nome: link.contato.nome,
                    sobrenome: link.contato.sobrenome,
                    email: link.contato.email,
                    telefone: link.contato.telefone,
                    role: 'traveler',
                    hasGift: giftSet.has(giftKey(link.card_id, link.contato.id)),
                })
            }

            // 8. Constrói o resultado por contato
            const result: Record<string, AvailableCard[]> = {}
            for (const id of ids) result[id] = []

            for (const card of cardMap.values()) {
                const cardTravelers = travelersByCard.get(card.id) || []
                // Determinar quais dos contatos selecionados estão nesse card
                const contactsOnCard = cardTravelers.filter(t => ids.includes(t.id))
                for (const contactOnCard of contactsOnCard) {
                    result[contactOnCard.id].push({
                        id: card.id,
                        titulo: card.titulo,
                        produto: card.produto,
                        dataInicio: card.data_viagem_inicio,
                        dataFim: card.data_viagem_fim,
                        role: contactOnCard.role,
                        hasGift: giftSet.has(giftKey(card.id, contactOnCard.id)),
                        travelers: cardTravelers.filter(t => t.id !== contactOnCard.id),
                    })
                }
            }

            return result
        },
        enabled: ids.length > 0,
        staleTime: 1000 * 30,
    })
}
