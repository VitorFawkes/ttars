import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

/**
 * Botão "Criar card" do Echo abre:
 *   /cards/echo/criar/:conversationId?nome=...&phone=...&phone_id=...&phone_label=...&agent_email=...
 *
 * Chama RPC criar_card_de_conversa_echo (idempotente) e redireciona para o card.
 * Se nome/phone não vierem nos query params, busca o contato pelo conversationId.
 */
export default function CreateCardFromEcho() {
    const { conversationId } = useParams<{ conversationId: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { profile } = useAuth()
    const [error, setError] = useState<string | null>(null)

    const stripBraces = (v: string | null | undefined): string => {
        if (!v) return ''
        return v.replace(/^\{/, '').replace(/\}$/, '').trim()
    }
    const onlyDigits = (v: string): string => v.replace(/\D/g, '')

    const rawPhone = searchParams.get('phone') || ''
    let phone = stripBraces(rawPhone)
    let phoneId = stripBraces(searchParams.get('phone_id'))
    let phoneLabel = stripBraces(searchParams.get('phone_label'))

    // Caso degenerado: phone vem como "554...}☎id={uuid}☎label={text"
    if (phone.includes('\u260E') || /\}\s*id\s*=\s*\{/i.test(phone)) {
        const parts = phone.split('\u260E')
        const phoneOnly = stripBraces(parts[0] || '')
        const idPart = parts.find(p => /^id\s*=/i.test(p)) || ''
        const labelPart = parts.find(p => /^label\s*=/i.test(p)) || ''
        const idMatch = idPart.match(/=\s*\{?([^}]*)\}?/)
        const labelMatch = labelPart.match(/=\s*\{?([^}]*)\}?/)
        phone = phoneOnly
        if (!phoneId && idMatch) phoneId = idMatch[1].trim()
        if (!phoneLabel && labelMatch) phoneLabel = labelMatch[1].trim()
    }

    phone = onlyDigits(phone)
    phoneId = phoneId || ''
    phoneLabel = phoneLabel || ''

    const nome = stripBraces(searchParams.get('nome'))
    const agentEmail = stripBraces(searchParams.get('agent_email'))

    const missingConversation = !conversationId

    useEffect(() => {
        if (missingConversation) return

        async function createCard() {
            let finalNome = nome
            let finalPhone = phone

            // Fallback: se nome ou phone não vieram nos query params,
            // buscar contato pelo conversationId na tabela contatos
            if (!finalNome || !finalPhone) {
                const { data: contato } = await supabase
                    .from('contatos')
                    .select('nome, sobrenome, telefone')
                    .eq('last_whatsapp_conversation_id', conversationId!)
                    .limit(1)
                    .maybeSingle()

                if (contato) {
                    if (!finalNome) {
                        finalNome = [contato.nome, contato.sobrenome].filter(Boolean).join(' ')
                    }
                    if (!finalPhone && contato.telefone) {
                        finalPhone = onlyDigits(contato.telefone)
                    }
                }
            }

            // Validar após fallback
            if (!finalNome || !finalPhone) {
                setError('Dados incompletos: nome e telefone são obrigatórios')
                return
            }
            if (finalPhone.length < 10) {
                setError(`Telefone inválido (recebido: "${rawPhone}")`)
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC ainda não regenerada nos types
            const { data, error: rpcError } = await (supabase as any).rpc('criar_card_de_conversa_echo', {
                p_conversation_id: conversationId!,
                p_name: finalNome,
                p_phone: finalPhone,
                p_phone_number_id: phoneId || null,
                p_phone_number_label: phoneLabel || null,
                p_agent_email: agentEmail || profile?.email || null,
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
    }, [missingConversation, conversationId, nome, phone, phoneId, phoneLabel, agentEmail, navigate, rawPhone])

    const displayError = missingConversation ? 'ID da conversa não informado' : error

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
