import { supabase } from './supabase'

/**
 * Troca a pessoa vinculada a um card pelo duplicado escolhido.
 * - Se `oldContactId` era o principal, usa a RPC `set_card_primary_contact` (swap atômico).
 * - Se era viajante, remove o link antigo em `cards_contatos` e garante o novo.
 *
 * Não deleta o contato antigo globalmente — apenas desfaz o vínculo com este card.
 */
export async function swapCardContact(
    cardId: string,
    oldContactId: string,
    newContactId: string
): Promise<{ role: 'primary' | 'traveler' }> {
    if (oldContactId === newContactId) return { role: 'traveler' }

    const { data: card, error: cardErr } = await supabase
        .from('cards')
        .select('pessoa_principal_id')
        .eq('id', cardId)
        .single()

    if (cardErr) throw cardErr

    const isPrimary = (card as { pessoa_principal_id: string | null } | null)?.pessoa_principal_id === oldContactId

    if (isPrimary) {
        const { error } = await supabase.rpc('set_card_primary_contact', {
            p_card_id: cardId,
            p_contact_id: newContactId,
        })
        if (error) throw error

        await supabase.from('cards_contatos')
            .delete()
            .eq('card_id', cardId)
            .eq('contato_id', oldContactId)

        return { role: 'primary' }
    }

    const { data: existingNewLink } = await supabase
        .from('cards_contatos')
        .select('id')
        .eq('card_id', cardId)
        .eq('contato_id', newContactId)
        .maybeSingle()

    if (existingNewLink) {
        const { error } = await supabase.from('cards_contatos')
            .delete()
            .eq('card_id', cardId)
            .eq('contato_id', oldContactId)
        if (error) throw error
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase query builder perde tipo
        const { error } = await (supabase.from('cards_contatos') as any)
            .update({ contato_id: newContactId })
            .eq('card_id', cardId)
            .eq('contato_id', oldContactId)
        if (error) throw error
    }

    return { role: 'traveler' }
}
