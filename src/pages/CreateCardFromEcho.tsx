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

    // Sanitize: strip {...} placeholders e qualquer separador ☎
    // O Echo (n8n) ocasionalmente envia tudo concatenado em "phone":
    //   {554...}☎id={uuid}☎label={Linha Y}
    // Aqui parseamos defensivamente para extrair os valores reais.
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

    // Garantia final: phone só com dígitos (impede gravar lixo no banco)
    phone = onlyDigits(phone)
    // phone_id costuma ser UUID — manter como veio (sem dígitos puros)
    phoneId = phoneId || ''
    phoneLabel = phoneLabel || ''

    const nome = stripBraces(searchParams.get('nome'))
    const agentEmail = stripBraces(searchParams.get('agent_email'))

    const validationError = !conversationId
        ? 'ID da conversa não informado'
        : (!nome || !phone)
            ? 'Dados incompletos: nome e telefone são obrigatórios'
            : phone.length < 10
                ? `Telefone inválido (recebido: "${rawPhone}")`
                : null

    useEffect(() => {
        if (validationError) return

        async function createCard() {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC ainda não regenerada nos types
            const { data, error: rpcError } = await (supabase as any).rpc('criar_card_de_conversa_echo', {
                p_conversation_id: conversationId!,
                p_name: nome,
                p_phone: phone,
                p_phone_number_id: phoneId || null,
                p_phone_number_label: phoneLabel || null,
                p_agent_email: agentEmail || null,
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
