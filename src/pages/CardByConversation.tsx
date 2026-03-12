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

    useEffect(() => {
        if (!conversationId) {
            setError('ID da conversa não informado')
            return
        }

        async function findCard() {
            // Find card via whatsapp_messages.conversation_id
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

            if (!message?.card_id) {
                setError('Nenhum card encontrado para essa conversa')
                return
            }

            // Redirect to card detail
            navigate(`/cards/${message.card_id}`, { replace: true })
        }

        findCard()
    }, [conversationId, navigate])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p className="text-slate-600">{error}</p>
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
