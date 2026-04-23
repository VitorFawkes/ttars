import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, X, Send, Loader2, Trash2, Zap, Sparkles, MessageSquare, Mic, FileText, ChevronDown, Combine } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useCreateProposal } from '@/hooks/useProposal'
import { useAuth } from '@/contexts/AuthContext'
import { useArchiveCard } from '@/hooks/useArchiveCard'
import { useAIExtractionReview } from '@/hooks/useAIExtractionReview'
import { useAIConversationExtraction } from '@/hooks/useAIConversationExtraction'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import DeleteCardModal from './DeleteCardModal'
import BriefingIAModal from './BriefingIAModal'
import TranscriptionIAModal from './TranscriptionIAModal'
import AIExtractionReviewModal from './AIExtractionReviewModal'
import AIConversationReviewModal from './AIConversationReviewModal'
import MergeCardsModal from './MergeCardsModal'
import { toast } from 'sonner'

interface ActionButtonsProps {
    card: {
        id: string
        pessoa_principal_id?: string | null
        titulo?: string | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any
    }
}

// Mudar para true quando quiser reativar os botões Email e Proposta
const SHOW_EMAIL_PROPOSAL = false

export default function ActionButtons({ card }: ActionButtonsProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [isCreatingProposal, setIsCreatingProposal] = useState(false)
    const createProposal = useCreateProposal()
    const [emailData, setEmailData] = useState({
        to: '',
        subject: '',
        body: ''
    })
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showBriefingIA, setShowBriefingIA] = useState(false)
    const [showTranscriptionIA, setShowTranscriptionIA] = useState(false)
    const [showAIReview, setShowAIReview] = useState(false)
    const [showAIConversation, setShowAIConversation] = useState(false)
    const [showMergeModal, setShowMergeModal] = useState(false)
    const aiReview = useAIExtractionReview(card.id)
    const aiConversation = useAIConversationExtraction(card.id)

    // Conta mensagens do card para habilitar botão "IA lê conversa"
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

    // Auto-close review modal when extraction finishes without preview (no_update, wrong_trip, etc.)
    // Or after applying fields (with preview) — brief delay to show success state
    useEffect(() => {
        if (!showAIReview || aiReview.step !== 'done') return
        if (!aiReview.preview) {
            // No preview = nothing to show, close immediately (toast already showed)
            setShowAIReview(false)
            aiReview.reset()
        } else {
            // Had preview = fields were applied, show success briefly then close
            const timer = setTimeout(() => {
                setShowAIReview(false)
                aiReview.reset()
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [showAIReview, aiReview.step, aiReview.preview])

    // Auto-close conversation modal após done sem preview ou 1.5s após apply
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
                    .single()
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
                    .single()

                // Use conversation URL only if it belongs to the current phase's line (or no phase mapping exists)
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
                        .single()

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
                    .single()

                if (mapping?.platform_id) {
                    const { data: platform } = await supabase
                        .from('whatsapp_platforms')
                        .select('name, dashboard_url_template')
                        .eq('id', mapping.platform_id)
                        .eq('is_active', true)
                        .single()

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

        // Log activity with context
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

        // Trigger Handshake (Sync) in background
        if (card.pessoa_principal_id) {
            syncWhatsAppMutation.mutate(card.pessoa_principal_id)
        }

        // Open the target URL
        window.open(targetUrl, '_blank')
    }

    const handleEmailSend = () => {
        logActivityMutation.mutate({
            tipo: 'email_sent',
            descricao: `Email enviado: ${emailData.subject}`,
            metadata: { to: emailData.to, subject: emailData.subject }
        })

        setShowEmailModal(false)
        setEmailData({ to: '', subject: '', body: '' })
    }

    // Pre-fill email when opening modal
    const openEmailModal = () => {
        if (contact?.email) {
            setEmailData(prev => ({ ...prev, to: contact.email || '' }))
        }
        setShowEmailModal(true)
    }

    return (
        <>
            <div className="flex gap-2">
                <button
                    onClick={handleWhatsAppClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium"
                    title="Enviar WhatsApp"
                >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    WhatsApp
                </button>

                {SHOW_EMAIL_PROPOSAL && (
                    <button
                        onClick={openEmailModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                        title="Enviar Email"
                    >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                    </button>
                )}

                {SHOW_EMAIL_PROPOSAL && (
                    <button
                        onClick={async () => {
                            setIsCreatingProposal(true)
                            try {
                                const { proposal } = await createProposal.mutateAsync({
                                    cardId: card.id,
                                    title: card.titulo || 'Nova Proposta',
                                })
                                toast.success('Proposta criada!', { description: 'Abrindo editor...' })
                                navigate(`/proposals/${proposal.id}/edit`)
                            } catch (error) {
                                console.error('Error creating proposal:', error)
                                toast.error('Erro ao criar proposta')
                            } finally {
                                setIsCreatingProposal(false)
                            }
                        }}
                        disabled={isCreatingProposal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-xs font-medium disabled:opacity-50"
                        title="Gerar Proposta"
                    >
                        {isCreatingProposal ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        )}
                        {isCreatingProposal ? 'Criando...' : 'Proposta'}
                    </button>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors text-xs font-medium"
                            disabled={
                                aiReview.step === 'extracting' ||
                                aiReview.step === 'applying' ||
                                aiConversation.step === 'extracting' ||
                                aiConversation.step === 'applying'
                            }
                        >
                            {aiReview.step === 'extracting' ||
                            aiReview.step === 'applying' ||
                            aiConversation.step === 'extracting' ||
                            aiConversation.step === 'applying' ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    IA analisando...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Usar IA
                                    <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                                </>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                            onClick={() => {
                                if (whatsappMessageCount < 3) {
                                    toast.info('A conversa ainda está curta — aguarde mais mensagens para a IA analisar.')
                                    return
                                }
                                setShowAIConversation(true)
                                aiConversation.extract()
                            }}
                            disabled={whatsappMessageCount < 3}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <MessageSquare className="h-4 w-4 text-green-600" />
                            <div className="flex-1">
                                <div className="text-sm font-medium">Ler conversa WhatsApp</div>
                                <div className="text-xs text-slate-500">
                                    {whatsappMessageCount < 3
                                        ? 'Precisa de pelo menos 3 mensagens'
                                        : 'Preenche viagem, contato e acompanhantes'}
                                </div>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setShowBriefingIA(true)}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <Mic className="h-4 w-4 text-amber-600" />
                            <div>
                                <div className="text-sm font-medium">Briefing por áudio</div>
                                <div className="text-xs text-slate-500">Gravar ou enviar áudio</div>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setShowTranscriptionIA(true)}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <FileText className="h-4 w-4 text-purple-600" />
                            <div>
                                <div className="text-sm font-medium">Transcrição de reunião</div>
                                <div className="text-xs text-slate-500">Colar transcrição e extrair dados</div>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {profile?.is_admin === true && (
                    <button
                        onClick={async () => {
                            if (!card.external_id) return;
                            const toastId = toast.loading('Sincronizando com ActiveCampaign...');
                            try {
                                const { error } = await supabase.functions.invoke('integration-sync-deals', {
                                    body: {
                                        deal_id: card.external_id,
                                        force_update: true
                                    }
                                });
                                if (error) throw error;
                                toast.success('Sincronização solicitada!', { id: toastId });
                            } catch (err: unknown) {
                                console.error('Erro detalhado sync:', err);
                                toast.error('Erro ao sincronizar', { id: toastId });
                            }
                        }}
                        disabled={!card.external_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors text-xs font-medium disabled:opacity-50"
                        title={!card.external_id ? "Sem vínculo externo" : "Sincronizar AC"}
                    >
                        <Zap className="h-3.5 w-3.5" />
                        Sync
                    </button>
                )}

                <button
                    onClick={() => setShowMergeModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors text-xs font-medium"
                    title="Agrupar este card com outro (mesma viagem)"
                >
                    <Combine className="h-3.5 w-3.5" />
                    Agrupar
                </button>

                <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors text-xs font-medium"
                    title="Arquivar Viagem"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                </button>
            </div>

            {/* Email Modal */}
            {SHOW_EMAIL_PROPOSAL && showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Enviar Email</h3>
                            <button
                                onClick={() => setShowEmailModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Para</label>
                                <input
                                    type="email"
                                    value={emailData.to}
                                    onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="cliente@exemplo.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                                <input
                                    type="text"
                                    value={emailData.subject}
                                    onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Sobre sua viagem..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                                <textarea
                                    value={emailData.body}
                                    onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    rows={6}
                                    placeholder="Digite sua mensagem..."
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleEmailSend}
                                    disabled={!emailData.to || !emailData.subject}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="h-4 w-4" />
                                    Enviar
                                </button>
                                <button
                                    onClick={() => setShowEmailModal(false)}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                    navigate(`/card/${destinoId}`)
                }}
            />
        </>
    )
}
