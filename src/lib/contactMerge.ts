import { supabase } from './supabase'

/**
 * Mescla dados novos em um contato existente.
 * - Atualiza campos (email, telefone, cpf) no contato
 * - Insere em contato_meios para suporte multi-contato
 *
 * Reutilizado em: People.tsx, ContactSelector.tsx, PersonDetailDrawer.tsx
 */
export async function mergeContactData(
    contactId: string,
    mergeData: Record<string, string | null>
): Promise<void> {
    if (!mergeData || Object.keys(mergeData).length === 0) return

    // 1. Update campos no contato existente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.from('contatos') as any)
        .update(mergeData)
        .eq('id', contactId)

    if (updateError) throw updateError

    // 2. Inserir em contato_meios se telefone/email novos
    const meiosToInsert: Array<{
        contato_id: string
        tipo: string
        valor: string
        is_principal: boolean
        origem: string
    }> = []

    if (mergeData.telefone) {
        meiosToInsert.push({
            contato_id: contactId,
            tipo: 'telefone',
            valor: mergeData.telefone,
            is_principal: false,
            origem: 'manual'
        })
    }
    if (mergeData.email) {
        meiosToInsert.push({
            contato_id: contactId,
            tipo: 'email',
            valor: mergeData.email,
            is_principal: false,
            origem: 'manual'
        })
    }

    if (meiosToInsert.length > 0) {
        const { error: meiosError } = await supabase.from('contato_meios').upsert(meiosToInsert, {
            onConflict: 'tipo,valor_normalizado',
            ignoreDuplicates: true
        })
        if (meiosError) {
            console.error('Error upserting contato_meios:', meiosError)
        }
    }
}
