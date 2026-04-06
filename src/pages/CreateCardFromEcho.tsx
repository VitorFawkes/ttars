import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

/**
 * Botão "Criar card" do Echo abre:
 *   /cards/echo/criar/:conversationId?nome=...&phone=...&phone_id=...&phone_label=...&agent_email=...
 *
 * Chama RPC criar_card_de_conversa_echo (idempotente) e redireciona para o card.
 */
export default function CreateCardFromEcho() {
    const { conversationId } = useParams<{ conversationId: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    const nome = searchParams.get('nome') || ''
    const phone = searchParams.get('phone') || ''
    const phoneId = searchParams.get('phone_id')
    const phoneLabel = searchParams.get('phone_label')
    const agentEmail = searchParams.get('agent_email')

    const validationError = !conversationId
        ? 'ID da conversa não informado'
        : (!nome || !phone)
            ? 'Dados incompletos: nome e telefone são obrigatórios'
            : null

    useEffect(() => {
        if (validationError) return

        async function createCard() {
            const { data, error: rpcError } = await supabase.rpc('criar_card_de_conversa_echo', {
                p_conversation_id: conversationId!,
                p_name: nome,
                p_phone: phone,
                p_phone_number_id: phoneId,
                p_phone_number_label: phoneLabel,
                p_agent_email: agentEmail,
            })

            if (rpcError) {
                console.error('Erro ao criar card via Echo:', rpcError)
                setError(rpcError.message || 'Erro ao criar card')
                return
            }

            const result = data as { id?: string } | null
            if (!result?.id) {
                setError('Resposta inválida do servidor')
                return
            }

            navigate(`/cards/${result.id}`, { replace: true })
        }

        createCard()
    }, [validationError, conversationId, nome, phone, phoneId, phoneLabel, agentEmail, navigate])

    const displayError = validationError || error

    if (displayError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-4 text-center">
                <p className="text-slate-900 font-medium">Não foi possível criar o card</p>
                <p className="text-sm text-slate-600">{displayError}</p>
                <button
                    onClick={() => navigate('/trips')}
                    className="text-indigo-600 hover:underline text-sm"
                >
                    Voltar para Cards
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-slate-600">Criando card a partir da conversa…</p>
        </div>
    )
}
