import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GiftAssignment } from './useCardGifts'

interface ContactGiftAssignment extends GiftAssignment {
    card?: { id: string; titulo: string; data_viagem_inicio: string | null; produto: string | null } | null
}

/** Fetches all gift assignments for a given contact across all cards */
export function useContactGifts(contatoId: string | undefined) {
    const { data: gifts = [], isLoading } = useQuery({
        queryKey: ['contact-gifts', contatoId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .select(`
                    *,
                    card:cards!card_gift_assignments_card_id_fkey(id, titulo, data_viagem_inicio, produto),
                    items:card_gift_items(
                        *,
                        product:inventory_products(id, name, sku, image_path, current_stock)
                    )
                `)
                .eq('contato_id', contatoId)
                .order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as ContactGiftAssignment[]
        },
        enabled: !!contatoId,
    })

    return { gifts, isLoading }
}
