import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Loader2,
    Trash2,
    Zap,
    MessageSquare,
    Mic,
    FileText,
    ChevronDown,
    Combine,
    ArrowUpFromLine,
    ArrowDownToLine,
    Copy,
    MoreHorizontal,
    Megaphone,
    MapPin,
} from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useArchiveCard } from '@/hooks/useArchiveCard'
import { useAIExtractionReview } from '@/hooks/useAIExtractionReview'
import { useAIConversationExtraction } from '@/hooks/useAIConversationExtraction'
import { usePromoteSubCard } from '@/hooks/usePromoteSubCard'
import { cn } from '@/lib/utils'
import DeleteCardModal from './DeleteCardModal'
import BriefingIAModal from './BriefingIAModal'
import TranscriptionIAModal from './TranscriptionIAModal'
import AIExtractionReviewModal from './AIExtractionReviewModal'
import AIConversationReviewModal from './AIConversationReviewModal'
import MergeCardsModal from './MergeCardsModal'
import TransformIntoSubCardModal from './TransformIntoSubCardModal'
import DuplicateCardModal from './DuplicateCardModal'
import { toast } from 'sonner'

interface ActionButtonsProps {
    card: {
        id: string
        pessoa_principal_id?: string | null
        titulo?: string | null
        produto?: string | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any
    }
    /** Callback to open the SendAlertModal that lives in CardHeader */
    onAlertClick?: () => void
}

type IconCmp = React.ComponentType<{ className?: string }>

interface MenuItem {
    key: string
    label: string
    desc: string
    icon: IconCmp
    onClick: () => void
    disabled?: boolean
    danger?: boolean
    show: boolean
}

interface MenuColumn {
    title: string
    tone: 'success' | 'primary' | 'neutral'
    items: MenuItem[]
}

// Inline WhatsApp glyph — keeps the official mark and avoids a new icon dep.
const WhatsAppGlyph = ({ className }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
)

export default function ActionButtons({ card, onAlertClick }: ActionButtonsProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showBriefingIA, setShowBriefingIA] = useState(false)
    const [showTranscriptionIA, setShowTranscriptionIA] = useState(false)
    const [showAIReview, setShowAIReview] = useState(false)
    const [showAIConversation, setShowAIConversation] = useState(false)
    const [showMergeModal, setShowMergeModal] = useState(false)
    const [showTransformModal, setShowTransformModal] = useState(false)
    const [showDuplicateModal, setShowDuplicateModal] = useState(false)
    const [showPromoteConfirm, setShowPromoteConfirm] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    const promoteSubCard = usePromoteSubCard()
    const aiReview = useAIExtractionReview(card.id)
    const aiConversation = useAIConversationExtraction(card.id)

    const cardType = (card as Record<string, unknown>).card_type as string | undefined
    const subCardStatus = (card as Record<string, unknown>).sub_card_status as string | undefined
    const isActiveSubCard = cardType === 'sub_card' && (subCardStatus === 'active' || subCardStatus === null || subCardStatus === undefined)
    const isTrips = card.produto === 'TRIPS' || !card.produto

    const handlePromote = async () => {
        try {
            await promoteSubCard.mutateAsync(card.id)
            toast.success('Sub-card virou card principal')
            setShowPromoteConfirm(false)
        } catch (err) {
            console.error('[ActionButtons] Erro ao promover sub-card:', err)
            toast.error((err as Error).message || 'Erro ao converter sub-card')
        }
    }

    // Close menu on Escape
    useEffect(() => {
        if (!menuOpen) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [menuOpen])

    // Conta mensagens do card para habilitar item "IA · Ler conversa WhatsApp"
    const { data: whatsappMessageCount = 0 } = useQuery({
        queryKey: ['whatsapp-message-count', card.id],
        queryFn: async () => {
            const { count } = await supabase
                .from('whatsapp_messages')
                .select('id', { count: 'exact', head: true })
                .eq('card_id', card.id)
            return count || 0
        },
        enabled: !!card.id,
        staleTime: 30_000,
    })

    // Auto-close review modal when extraction finishes without preview
    useEffect(() => {
        if (!showAIReview || aiReview.step !== 'done') return
        if (!aiReview.preview) {
            setShowAIReview(false)
            aiReview.reset()
        } else {
            const timer = setTimeout(() => {
                setShowAIReview(false)
                aiReview.reset()
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [showAIReview, aiReview.step, aiReview.preview])

    // Auto-close conversation modal
    useEffect(() => {
        if (!showAIConversation || aiConversation.step !== 'done') return
        if (!aiConversation.preview) {
            setShowAIConversation(false)
            aiConversation.reset()
        } else {
            const timer = setTimeout(() => {
                setShowAIConversation(false)
                aiConversation.reset()
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [showAIConversation, aiConversation.step, aiConversation.preview])

    const { archive, isArchiving } = useArchiveCard({
        onSuccess: () => navigate('/pipeline')
    })

    const logActivityMutation = useMutation({
        mutationFn: async (activity: { tipo: string; descricao: string; metadata?: Record<string, unknown> }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('activities') as any)
                .insert({
                    card_id: card.id,
                    tipo: activity.tipo,
                    descricao: activity.descricao,
                    metadata: activity.metadata,
                    created_by: (await supabase.auth.getUser()).data.user?.id
                })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activity-feed', card.id] })
        }
    })

    // Fetch primary contact details
    const { data: contact } = useQuery({
        queryKey: ['contact', card.pessoa_principal_id],
        queryFn: async () => {
            if (!card.pessoa_principal_id) return null
            const { data, error } = await supabase
                .from('contatos')
                .select('email, telefone')
                .eq('id', card.pessoa_principal_id)
                .single()

            if (error) throw error
            return data
        },
        enabled: !!card.pessoa_principal_id
    })

    const syncWhatsAppMutation = useMutation({
        mutationFn: async (contactId: string) => {
            const { data, error } = await supabase.functions.invoke('sync-whatsapp-history', {
                body: { contact_id: contactId }
            })
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conversations-whatsapp'] })
        }
    })

    const handleWhatsAppClick = async () => {
        if (!contact?.telefone) {
            alert('Este contato não possui telefone cadastrado.')
            return
        }

        const cleanNumber = contact.telefone.replace(/\D/g, '')
        const message = encodeURIComponent(`Olá! Sobre sua viagem: ${card.titulo}`)

        // Open a placeholder window synchronously, BEFORE any await — this preserves
        // the user-gesture context that browsers require for window.open. Without this,
        // popup-blockers can drop the call (or the menu close re-render races the open),
        // and the user ends up on wa.me instead of Echo.
        const openedWindow = window.open('about:blank', '_blank')

        let targetUrl: string | null = null
        let fallbackUsed = 'wa_me'
        let platformName = 'WhatsApp'

        try {
            const currentPhaseId = card.pipeline_stage?.phase_id

            // Resolve expected phone line for current phase
            let expectedPhoneLabel: string | null = null
            if (currentPhaseId) {
                const { data: lineConfig } = await (supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('whatsapp_linha_config') as any)
                    .select('phone_number_label')
                    .eq('phase_id', currentPhaseId)
                    .eq('ativo', true)
                    .limit(1)
                    .maybeSingle()
                expectedPhoneLabel = lineConfig?.phone_number_label || null
            }

            // PRIORITY 1: Check conversation — only use if it matches current phase's line
            if (card.pessoa_principal_id) {
                const { data: conversation } = await (supabase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .from('whatsapp_conversations') as any)
                    .select('external_conversation_id, external_conversation_url, platform_id, phone_number_label')
                    .eq('contact_id', card.pessoa_principal_id)
                    .order('last_message_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                const conversationMatchesPhase = !expectedPhoneLabel || conversation?.phone_number_label === expectedPhoneLabel

                if (conversation?.external_conversation_url && conversationMatchesPhase) {
                    targetUrl = conversation.external_conversation_url
                    fallbackUsed = 'deep_link'
                    platformName = 'Echo'
                } else if (conversation?.external_conversation_id && conversationMatchesPhase) {
                    const { data: platform } = await supabase
                        .from('whatsapp_platforms')
                        .select('name, dashboard_url_template')
                        .eq('id', conversation.platform_id)
                        .maybeSingle()

                    if (platform?.dashboard_url_template) {
                        targetUrl = platform.dashboard_url_template.replace('{conversation_id}', conversation.external_conversation_id)
                        fallbackUsed = 'deep_link'
                        platformName = platform.name || 'Echo'
                    }
                }
            }

            // PRIORITY 2: Phase mapping fallback (opens Echo dashboard)
            if (!targetUrl && currentPhaseId) {
                const { data: mapping } = await (supabase
                    .from('whatsapp_phase_instance_map' as never)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .select('platform_id') as any)
                    .eq('phase_id', currentPhaseId)
                    .eq('is_active', true)
                    .order('priority')
                    .limit(1)
                    .maybeSingle()

                if (mapping?.platform_id) {
                    const { data: platform } = await supabase
                        .from('whatsapp_platforms')
                        .select('name, dashboard_url_template')
                        .eq('id', mapping.platform_id)
                        .eq('is_active', true)
                        .maybeSingle()

                    if (platform?.dashboard_url_template && !platform.dashboard_url_template.includes('{')) {
                        targetUrl = platform.dashboard_url_template
                        fallbackUsed = 'dashboard'
                        platformName = platform.name || 'Echo'
                    }
                }
            }
        } catch (err) {
            console.warn('WhatsApp platform lookup failed, using fallback:', err)
        }

        // PRIORITY 3: Universal fallback to wa.me
        if (!targetUrl) {
            targetUrl = `https://wa.me/${cleanNumber}?text=${message}`
            fallbackUsed = 'wa_me'
        }

        logActivityMutation.mutate({
            tipo: 'whatsapp_sent',
            descricao: `WhatsApp via ${platformName}`,
            metadata: {
                contact_id: card.pessoa_principal_id,
                phone: cleanNumber,
                fallback_used: fallbackUsed,
                platform: platformName
            }
        })

        if (card.pessoa_principal_id) {
            syncWhatsAppMutation.mutate(card.pessoa_principal_id)
        }

        // Steer the placeholder window we opened earlier; if blocked, fall back to same tab.
        if (openedWindow && !openedWindow.closed) {
            openedWindow.location.href = targetUrl
        } else {
            window.location.href = targetUrl
        }
    }

    const handleSync = async () => {
        if (!card.external_id) return
        const toastId = toast.loading('Sincronizando com ActiveCampaign...')
        try {
            const { error } = await supabase.functions.invoke('integration-sync-deals', {
                body: { deal_id: card.external_id, force_update: true }
            })
            if (error) throw error
            toast.success('Sincronização solicitada!', { id: toastId })
        } catch (err) {
            console.error('Erro detalhado sync:', err)
            toast.error('Erro ao sincronizar', { id: toastId })
        }
    }

    const handleAIWhatsapp = () => {
        if (whatsappMessageCount < 3) {
            toast.info('A conversa ainda está curta — aguarde mais mensagens para a IA analisar.')
            return
        }
        setShowAIConversation(true)
        aiConversation.extract()
    }

    const aiBusy =
        aiReview.step === 'extracting' || aiReview.step === 'applying' ||
        aiConversation.step === 'extracting' || aiConversation.step === 'applying'

    // Run all menu items through `show` so empty columns can hide their title.
    const columns: MenuColumn[] = [
        {
            title: 'Comunicação',
            tone: 'success',
            items: [
                {
                    key: 'whatsapp',
                    label: 'WhatsApp',
                    desc: 'Abrir conversa com o cliente',
                    icon: WhatsAppGlyph,
                    onClick: () => { setMenuOpen(false); handleWhatsAppClick() },
                    show: true,
                },
                {
                    key: 'alert',
                    label: 'Alertar',
                    desc: 'Notificar a equipe sobre este card',
                    icon: Megaphone,
                    onClick: () => { setMenuOpen(false); onAlertClick?.() },
                    show: !!onAlertClick,
                },
            ],
        },
        {
            title: 'Operação',
            tone: 'primary',
            items: [
                {
                    key: 'trip-page',
                    label: 'Página da Viagem',
                    desc: 'Abrir a página pública',
                    icon: MapPin,
                    onClick: () => { setMenuOpen(false); navigate(`/cards/${card.id}/viagem`) },
                    show: isTrips,
                },
                {
                    key: 'sync',
                    label: 'Sync',
                    desc: 'Sincronizar com ActiveCampaign',
                    icon: Zap,
                    onClick: () => { setMenuOpen(false); handleSync() },
                    show: profile?.is_admin === true && !!card.external_id,
                },
                {
                    key: 'ai-whatsapp',
                    label: 'IA · Ler conversa WhatsApp',
                    desc: whatsappMessageCount < 3 ? 'Precisa de pelo menos 3 mensagens' : 'Preencher viagem, contato e acompanhantes',
                    icon: MessageSquare,
                    onClick: () => { setMenuOpen(false); handleAIWhatsapp() },
                    disabled: whatsappMessageCount < 3 || aiBusy,
                    show: true,
                },
                {
                    key: 'ai-briefing',
                    label: 'IA · Briefing por áudio',
                    desc: 'Gravar ou enviar áudio',
                    icon: Mic,
                    onClick: () => { setMenuOpen(false); setShowBriefingIA(true) },
                    disabled: aiBusy,
                    show: true,
                },
                {
                    key: 'ai-transcript',
                    label: 'IA · Transcrição de reunião',
                    desc: 'Colar transcrição e extrair dados',
                    icon: FileText,
                    onClick: () => { setMenuOpen(false); setShowTranscriptionIA(true) },
                    disabled: aiBusy,
                    show: true,
                },
            ],
        },
        {
            title: 'Card',
            tone: 'neutral',
            items: [
                {
                    key: 'group',
                    label: 'Agrupar',
                    desc: 'Vincular a outros cards (mesma viagem)',
                    icon: Combine,
                    onClick: () => { setMenuOpen(false); setShowMergeModal(true) },
                    show: true,
                },
                {
                    key: 'sub-card',
                    label: 'Virar sub-card',
                    desc: 'Tornar filho de um card em pós-venda',
                    icon: ArrowDownToLine,
                    onClick: () => { setMenuOpen(false); setShowTransformModal(true) },
                    show: cardType === 'standard' && card.parent_card_id == null && subCardStatus == null && card.is_group_parent !== true,
                },
                {
                    key: 'duplicate',
                    label: 'Duplicar',
                    desc: 'Criar uma cópia desta viagem (sem cliente)',
                    icon: Copy,
                    onClick: () => { setMenuOpen(false); setShowDuplicateModal(true) },
                    show: cardType === 'standard',
                },
                {
                    key: 'promote',
                    label: 'Virar card principal',
                    desc: 'Desvincular este sub-card do card pai',
                    icon: ArrowUpFromLine,
                    onClick: () => { setMenuOpen(false); setShowPromoteConfirm(true) },
                    disabled: promoteSubCard.isPending,
                    show: isActiveSubCard,
                },
                {
                    key: 'delete',
                    label: 'Excluir',
                    desc: 'Arquivar este card',
                    icon: Trash2,
                    onClick: () => { setMenuOpen(false); setShowDeleteModal(true) },
                    danger: true,
                    show: true,
                },
            ],
        },
    ]

    const visibleColumns = columns
        .map((c) => ({ ...c, items: c.items.filter((i) => i.show) }))
        .filter((c) => c.items.length > 0)

    return (
        <>
            <div className="flex items-center gap-1.5 relative">
                {/* Single trigger: "Ações ▾" mega-menu — all actions live here */}
                <button
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors shadow-sm",
                        menuOpen
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 hover:border-indigo-700"
                    )}
                    title="Abrir menu de ações"
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span>Ações</span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", menuOpen && "rotate-180")} />
                    {aiBusy && <Loader2 className="h-3 w-3 animate-spin ml-0.5" />}
                </button>

                {menuOpen && (
                    <>
                        {/* Click-outside catcher */}
                        <div
                            className="fixed inset-0 z-30"
                            onClick={() => setMenuOpen(false)}
                            aria-hidden="true"
                        />
                        <MegaMenu columns={visibleColumns} />
                    </>
                )}
            </div>

            <DeleteCardModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={() => archive(card.id)}
                isLoading={isArchiving}
                cardTitle={card.titulo || undefined}
            />

            <BriefingIAModal
                isOpen={showBriefingIA}
                onClose={() => setShowBriefingIA(false)}
                cardId={card.id}
                cardType={(card as Record<string, unknown>).card_type as string | undefined}
                onRequestReview={(audioBlob, mode) => {
                    setShowBriefingIA(false)
                    aiReview.extractPreview('briefing_audio', { audioBlob, mode })
                    setShowAIReview(true)
                }}
            />

            <TranscriptionIAModal
                isOpen={showTranscriptionIA}
                onClose={() => setShowTranscriptionIA(false)}
                cardId={card.id}
                cardTitle={card.titulo || undefined}
                onRequestReview={(transcription, mode, meetingId) => {
                    setShowTranscriptionIA(false)
                    aiReview.extractPreview('meeting_transcript', { transcription, mode, meetingId })
                    setShowAIReview(true)
                }}
            />

            <AIExtractionReviewModal
                isOpen={showAIReview}
                onClose={() => { setShowAIReview(false); aiReview.reset() }}
                step={aiReview.step}
                preview={aiReview.preview}
                onApply={(decisions, approveBriefing) => aiReview.applyDecisions(decisions, approveBriefing)}
                onCancel={() => { setShowAIReview(false); aiReview.reset() }}
            />

            <AIConversationReviewModal
                isOpen={showAIConversation}
                onClose={() => { setShowAIConversation(false); aiConversation.reset() }}
                step={aiConversation.step}
                preview={aiConversation.preview}
                onApply={(decisions) => aiConversation.apply(decisions)}
                onCancel={() => { setShowAIConversation(false); aiConversation.reset() }}
            />

            <MergeCardsModal
                open={showMergeModal}
                onClose={() => setShowMergeModal(false)}
                sourceCardId={card.id}
                targetCardId={null}
                onMerged={(destinoId) => {
                    setShowMergeModal(false)
                    navigate(`/cards/${destinoId}`, { replace: true })
                }}
            />

            <TransformIntoSubCardModal
                open={showTransformModal}
                onClose={() => setShowTransformModal(false)}
                card={{
                    id: card.id,
                    titulo: card.titulo ?? null,
                    produto: (card as Record<string, unknown>).produto as string | null | undefined,
                    pipeline_id: (card as Record<string, unknown>).pipeline_id as string | null | undefined,
                }}
                onLinked={(parentId) => navigate(`/cards/${parentId}`, { replace: true })}
            />

            <DuplicateCardModal
                open={showDuplicateModal}
                onClose={() => setShowDuplicateModal(false)}
                card={{ id: card.id, titulo: card.titulo ?? null }}
            />

            {showPromoteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <ArrowUpFromLine className="h-5 w-5 text-indigo-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900">Virar card principal</h3>
                        </div>

                        <p className="text-sm text-slate-600 mb-4">
                            Este sub-card vai deixar de ser filho do card pai e passa a existir sozinho, como um card comum.
                        </p>

                        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1 mb-5">
                            <p><strong className="text-slate-900">O que muda:</strong></p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>Desvincula do card pai</li>
                                <li>Perde a marcação de "mudança" ou "venda adicional"</li>
                                <li>Continua com todos os produtos, pessoas e histórico próprios</li>
                            </ul>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowPromoteConfirm(false)}
                                disabled={promoteSubCard.isPending}
                                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePromote}
                                disabled={promoteSubCard.isPending}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
                            >
                                {promoteSubCard.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Convertendo...
                                    </>
                                ) : (
                                    <>
                                        <ArrowUpFromLine className="h-4 w-4" />
                                        Confirmar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function MegaMenu({ columns }: { columns: MenuColumn[] }) {
    const ref = useRef<HTMLDivElement>(null)
    const toneClasses: Record<MenuColumn['tone'], string> = {
        success: 'text-emerald-700',
        primary: 'text-indigo-700',
        neutral: 'text-gray-700',
    }
    return (
        <div
            ref={ref}
            role="menu"
            className="absolute top-full right-0 mt-2 z-40 bg-white rounded-xl shadow-2xl border border-gray-200 p-3.5 grid gap-3.5 animate-in fade-in zoom-in-95 duration-100"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}
        >
            {columns.map((col) => (
                <div key={col.title} className="flex flex-col gap-0.5">
                    <div className={cn(
                        "text-[10px] font-extrabold uppercase tracking-[0.1em] pl-1.5 pb-1.5 mb-1 border-b border-gray-100",
                        toneClasses[col.tone]
                    )}>
                        {col.title}
                    </div>
                    {col.items.map((item) => {
                        const Icon = item.icon
                        return (
                            <button
                                key={item.key}
                                role="menuitem"
                                onClick={item.onClick}
                                disabled={item.disabled}
                                className={cn(
                                    "flex items-start gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors",
                                    item.disabled
                                        ? "opacity-50 cursor-not-allowed"
                                        : item.danger
                                            ? "hover:bg-red-50 text-red-700"
                                            : "hover:bg-gray-50 text-gray-800"
                                )}
                            >
                                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", item.danger ? "text-red-500" : "text-gray-500")} />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-semibold leading-tight">{item.label}</span>
                                    <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{item.desc}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
