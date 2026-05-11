import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'
import SelectExistingOrNewCardModal, { type EchoOpenCard } from '../components/echo/SelectExistingOrNewCardModal'

/**
 * Botão "Criar card" do Echo abre:
 *   /cards/echo/criar/:conversationId?nome=...&phone=...&phone_id=...&phone_label=...&agent_email=...
 *
 * Máquina de estados (Marco B):
 *   loading    → carrega lista de cards abertos do contato
 *   decision   → mostra cards abertos (≥1) e deixa operador escolher
 *   creating   → executa criação (dedup normal ou forçada)
 *   error      → erro de validação ou de rede
 *
 * Quando o contato não tem card aberto, pula direto para creating com dedup normal.
 */

type Phase = 'loading' | 'decision' | 'creating' | 'error'

const stripBraces = (v: string | null | undefined): string => {
    if (!v) return ''
    const cleaned = v.replace(/^\{+/, '').replace(/\}+$/, '').trim()
    if (/^[a-z_]+\.[a-z_]+$/i.test(cleaned)) return ''
    return cleaned
}
const onlyDigits = (v: string): string => v.replace(/\D/g, '')

type CardEchoRpcResult = { id?: string; titulo?: string; dedup?: boolean }
type ListCardsRpcResult = {
    contact_found: boolean
    contact_id?: string
    produto?: string
    cards: EchoOpenCard[]
    error?: string
}

export default function CreateCardFromEcho() {
    const { conversationId } = useParams<{ conversationId: string }>()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { profile } = useAuth()

    const [phase, setPhase] = useState<Phase>('loading')
    const [error, setError] = useState<string | null>(null)
    const [openCards, setOpenCards] = useState<EchoOpenCard[]>([])

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

    const nome = stripBraces(searchParams.get('nome'))
    const agentEmail = stripBraces(searchParams.get('agent_email'))

    const cleanConversationId = stripBraces(conversationId)
    const missingConversation = !cleanConversationId

    // Função de criação (usada tanto no fluxo direto quanto no "criar nova")
    const createCard = useCallback(async (force: boolean) => {
        setPhase('creating')

        let finalNome = nome
        let finalPhone = phone

        // Fallback: se nome ou phone não vieram nos query params,
        // buscar contato pelo conversationId na tabela contatos
        if (!finalNome || !finalPhone) {
            const { data: contato } = await supabase
                .from('contatos')
                .select('nome, sobrenome, telefone')
                .eq('last_whatsapp_conversation_id', cleanConversationId!)
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

        if (!finalNome || !finalPhone) {
            setError('Dados incompletos: nome e telefone são obrigatórios')
            setPhase('error')
            return
        }
        if (finalPhone.length < 10) {
            setError(`Telefone inválido (recebido: "${rawPhone}")`)
            setPhase('error')
            return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC ainda não regenerada nos types
        const { data, error: rpcError } = await (supabase as any).rpc('criar_card_de_conversa_echo', {
            p_conversation_id: cleanConversationId!,
            p_name: finalNome,
            p_phone: finalPhone,
            p_phone_number_id: phoneId || null,
            p_phone_number_label: phoneLabel || null,
            p_agent_email: agentEmail || profile?.email || null,
            p_force_create: force,
        })

        if (rpcError) {
            console.error('Erro ao criar card via Echo:', rpcError)
            setError(rpcError.message || 'Erro ao criar card')
            setPhase('error')
            return
        }

        const result = data as CardEchoRpcResult | null
        if (!result?.id) {
            setError('Resposta inválida do servidor')
            setPhase('error')
            return
        }

        navigate(`/cards/${result.id}`, { replace: true })
    }, [nome, phone, rawPhone, cleanConversationId, phoneId, phoneLabel, agentEmail, profile?.email, navigate])

    // Fase 1: listar cards abertos do contato
    useEffect(() => {
        if (missingConversation) return

        async function loadOpenCards() {
            if (!phone || phone.length < 10) {
                // Sem telefone válido: pula direto para criação (a RPC principal vai validar)
                await createCard(false)
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC ainda não regenerada nos types
            const { data, error: rpcError } = await (supabase as any).rpc('listar_cards_abertos_do_contato_echo', {
                p_phone: phone,
                p_phone_number_id: phoneId || null,
                p_phone_number_label: phoneLabel || null,
                p_conversation_id: cleanConversationId || null,
            })

            if (rpcError) {
                // Se listagem falhar, tenta criar direto (comportamento pré-Marco B)
                console.warn('Falha ao listar cards abertos, seguindo com criação direta:', rpcError)
                await createCard(false)
                return
            }

            const result = data as ListCardsRpcResult | null
            const cards = result?.cards ?? []

            if (!result?.contact_found || cards.length === 0) {
                // Contato novo ou sem cards abertos: cria direto
                await createCard(false)
                return
            }

            setOpenCards(cards)
            setPhase('decision')
        }

        loadOpenCards()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [missingConversation, cleanConversationId, phone, phoneId, phoneLabel])

    const handleSelectExisting = useCallback((cardId: string) => {
        navigate(`/cards/${cardId}`, { replace: true })
    }, [navigate])

    const handleCreateNew = useCallback(() => {
        createCard(true)
    }, [createCard])

    // ---------- Renderização ----------
    const displayError = missingConversation
        ? 'O botão do Echo não enviou os dados do contato. Verifique a configuração do botão "Criar Card" no Echo.'
        : error

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

    if (phase === 'decision') {
        return (
            <SelectExistingOrNewCardModal
                cards={openCards}
                contactName={nome || 'Contato'}
                phoneLabel={phoneLabel || null}
                creatingNew={false}
                onSelectExisting={handleSelectExisting}
                onCreateNew={handleCreateNew}
            />
        )
    }

    // loading | creating
    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-slate-600">
                {phase === 'creating' ? 'Criando card a partir da conversa…' : 'Verificando viagens abertas…'}
            </p>
        </div>
    )
}
