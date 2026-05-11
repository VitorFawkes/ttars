import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

/**
 * Redirect page: /cards/convo/:conversationId
 * Looks up the card by Echo conversation ID and redirects to card detail.
 */
export default function CardByConversation() {
    const { conversationId } = useParams<{ conversationId: string }>()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    const validationError = !conversationId ? 'ID da conversa não informado' : null

    useEffect(() => {
        if (validationError) return

        async function findCard() {
            // 1. Find card via whatsapp_messages.conversation_id
            const { data: message, error: msgError } = await supabase
                .from('whatsapp_messages')
                .select('card_id')
                .eq('conversation_id', conversationId!)
                .not('card_id', 'is', null)
                .limit(1)
                .maybeSingle()

            if (msgError) {
                console.error('Erro ao buscar card:', msgError)
                setError('Erro ao buscar card')
                return
            }

            if (message?.card_id) {
                navigate(`/cards/${message.card_id}`, { replace: true })
                return
            }

            // 2. Fallback: contatos.last_whatsapp_conversation_id → card aberto
            // (cards criados pelo botão "Criar card" não geram whatsapp_messages)
            const { data: contato } = await supabase
                .from('contatos')
                .select('id')
                .eq('last_whatsapp_conversation_id', conversationId!)
                .limit(1)
                .maybeSingle()

            if (contato?.id) {
                const { data: card } = await supabase
                    .from('cards')
                    .select('id')
                    .eq('pessoa_principal_id', contato.id)
                    .not('status_comercial', 'in', '("ganho","perdido")')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                if (card?.id) {
                    navigate(`/cards/${card.id}`, { replace: true })
                    return
                }
            }

            setError('Nenhum card encontrado para essa conversa')
        }

        findCard()
    }, [validationError, conversationId, navigate])

    const displayError = validationError || error

    if (displayError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p className="text-slate-600">{displayError}</p>
                <button
                    onClick={() => navigate('/trips')}
                    className="text-indigo-600 hover:underline"
                >
                    Voltar para Cards
                </button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
    )
}
