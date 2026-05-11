import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'


// Manual definition to match actual DB schema (database.types.ts is out of sync)
interface Contact {
    id: string
    nome: string
    sobrenome: string | null
    email: string | null
    telefone: string | null
    tipo_pessoa: 'adulto' | 'crianca'
    tipo_contato?: 'pessoa' | 'empresa' | null
    empresa_id?: string | null
    cargo?: string | null
    // Add other fields as needed
}

export interface CardPerson extends Contact {
    role: 'primary' | 'traveler'
}

export function useCardPeople(cardId: string | undefined) {
    const queryClient = useQueryClient()

    // Unified Query: Fetches both Primary and Travelers
    const { data: people, isLoading } = useQuery({
        queryKey: ['card-people', cardId],
        queryFn: async () => {
            if (!cardId) return []

            // 1. Fetch Card (for Primary)
            const { data: card, error: cardError } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
                .from('cards') as any)
                .select(`
                    pessoa_principal_id,
                    contato:contatos!cards_pessoa_principal_id_fkey (*)
                `)
                .eq('id', cardId)
                .single()

            if (cardError) throw cardError

            // 2. Fetch Travelers
            const { data: travelersData, error: travelersError } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
                .from('cards_contatos') as any)
                .select(`
                    contato:contatos (*)
                `)
                .eq('card_id', cardId)
                .order('ordem')

            if (travelersError) throw travelersError

            const result: CardPerson[] = []

            // Add Primary
            if (card.contato) {
                result.push({
                    ...(card.contato as Contact),
                    role: 'primary'
                })
            }

            // Add Travelers
            const travelers = (travelersData || [])
                .map((item: { contato: Contact }) => item.contato)
                .filter((c: Contact | null) => !!c)
                .map((c: Contact) => ({ ...c, role: 'traveler' } as CardPerson))

            result.push(...travelers)

            return result
        },
        enabled: !!cardId
    })

    // --- Mutations ---

    // Promote to Primary (Atomic)
    const promoteToPrimaryMutation = useMutation({
        mutationFn: async (contactId: string) => {
            if (!cardId) throw new Error('Card ID required')

            const { error } = await supabase
                .rpc('set_card_primary_contact', {
                    p_card_id: cardId,
                    p_contact_id: contactId
                })

            if (error) throw error
        },
        onMutate: async (contactId) => {
            await queryClient.cancelQueries({ queryKey: ['card-people', cardId] })
            const previousPeople = queryClient.getQueryData<CardPerson[]>(['card-people', cardId])

            queryClient.setQueryData(['card-people', cardId], (old: CardPerson[] | undefined) => {
                if (!old) return []

                const promotedPerson = old.find(p => p.id === contactId)
                if (!promotedPerson) return old

                // Swap: novo primary sobe, antigo primary vira viajante
                return old.map(p => {
                    if (p.id === contactId) {
                        return { ...p, role: 'primary' as const }
                    }
                    if (p.role === 'primary') {
                        return { ...p, role: 'traveler' as const }
                    }
                    return p
                })
            })

            return { previousPeople }
        },
        onError: (err, __, context) => {
            if (context?.previousPeople) {
                queryClient.setQueryData(['card-people', cardId], context.previousPeople)
            }
            const message = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro ao trocar contato principal', { description: message })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-people', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-contacts', cardId] }) // Sync CardTravelers
            queryClient.invalidateQueries({ queryKey: ['card', cardId] }) // Keep legacy sync
        }
    })

    // Remove Person (Generic)
    const removePersonMutation = useMutation({
        mutationFn: async (person: CardPerson) => {
            if (!cardId) throw new Error('Card ID required')

            if (person.role === 'primary') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
                const { error } = await (supabase.from('cards') as any)
                    .update({ pessoa_principal_id: null })
                    .eq('id', cardId)
                if (error) throw error
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
                const { error } = await (supabase.from('cards_contatos') as any)
                    .delete()
                    .eq('card_id', cardId)
                    .eq('contato_id', person.id)
                if (error) throw error
            }
        },
        onMutate: async (person) => {
            await queryClient.cancelQueries({ queryKey: ['card-people', cardId] })
            const previousPeople = queryClient.getQueryData(['card-people', cardId])

            queryClient.setQueryData(['card-people', cardId], (old: CardPerson[] | undefined) => {
                return old?.filter(p => p.id !== person.id) || []
            })

            return { previousPeople }
        },
        onError: (_, __, context) => {
            if (context?.previousPeople) {
                queryClient.setQueryData(['card-people', cardId], context.previousPeople)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-people', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-contacts', cardId] }) // Sync with CardTravelers
            queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        }
    })

    // Add Person (as Traveler)
    const addPersonMutation = useMutation({
        mutationFn: async (contact: { id: string, nome: string }) => {
            if (!cardId) throw new Error('Card ID required')

            // Forensic Fix: Check if already exists to avoid 409 conflict
            const isAlreadyLinked = people?.some(p => p.id === contact.id)
            if (isAlreadyLinked) {
                console.warn(`[DEBUG] Contact ${contact.nome} (${contact.id}) is already linked to card ${cardId}. Skipping insert.`);
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder
            const { error } = await (supabase.from('cards_contatos') as any)
                .insert({
                    card_id: cardId,
                    contato_id: contact.id,
                    ordem: 99 // Append to end
                })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-people', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-contacts', cardId] }) // Sync with CardTravelers
        }
    })

    return {
        people,
        primary: people?.find(p => p.role === 'primary') || null,
        travelers: people?.filter(p => p.role === 'traveler') || [],
        isLoading,
        promoteToPrimary: promoteToPrimaryMutation.mutate,
        removePerson: removePersonMutation.mutate,
        addPerson: addPersonMutation.mutate,
        isUpdating: promoteToPrimaryMutation.isPending || removePersonMutation.isPending || addPersonMutation.isPending
    }
}
