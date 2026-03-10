import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Mail, ChevronDown, ChevronUp, Sparkles, Video, Bot } from 'lucide-react'
import { cn } from '../../lib/utils'
import AIChat from './AIChat'
import { MeetingTimeline } from './MeetingTimeline'

import { WhatsAppHistory } from './WhatsAppHistory'

interface ConversationHistoryProps {
    cardId: string
    contactId?: string | null
}

type Tab = 'email' | 'meetings' | 'ai' | 'whatsapp'

export default function ConversationHistory({ cardId, contactId }: ConversationHistoryProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [activeTab, setActiveTab] = useState<Tab>('whatsapp')
    const [toggling, setToggling] = useState(false)
    const queryClient = useQueryClient()

    // Fetch AI status for this card
    const { data: aiStatus } = useQuery({
        queryKey: ['card-ai-status', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('ai_responsavel')
                .eq('id', cardId)
                .single()
            if (error) return null
            return (data as unknown as { ai_responsavel: string | null })?.ai_responsavel || 'ia'
        },
        enabled: !!cardId,
    })

    const aiActive = aiStatus === 'ia'

    const toggleAI = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (toggling) return
        setToggling(true)
        try {
            const newValue = aiActive ? 'humano' : 'ia'
            await supabase
                .from('cards')
                .update({ ai_responsavel: newValue } as Record<string, unknown>)
                .eq('id', cardId)
            queryClient.invalidateQueries({ queryKey: ['card-ai-status', cardId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        } finally {
            setToggling(false)
        }
    }

    // Fetch Email conversations (Legacy)
    const { data: emailData } = useQuery({
        queryKey: ['conversations-email', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activities')
                .select('*, profiles:created_by(nome)')
                .eq('card_id', cardId)
                .eq('tipo', 'email')
                .order('created_at', { ascending: false })

            if (error) throw error
            return data || []
        },
        enabled: isExpanded && activeTab === 'email'
    })

    // Fetch Meeting records (Legacy)
    const { data: meetingsData } = useQuery({
        queryKey: ['conversations-meetings', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activities')
                .select('*, profiles:created_by(nome)')
                .eq('card_id', cardId)
                .eq('tipo', 'meeting_created')
                .order('created_at', { ascending: false })

            if (error) throw error
            return data || []
        },
        enabled: isExpanded && activeTab === 'meetings'
    })

    return (
        <div className="rounded-lg border bg-white shadow-sm">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Histórico de Conversas</h3>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                        {(emailData?.length || 0) + (meetingsData?.length || 0)}
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t">
                    {/* Tabs */}
                    <div className="flex border-b bg-gray-50 overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('whatsapp')}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                                activeTab === 'whatsapp'
                                    ? "border-green-500 text-green-700 bg-white"
                                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            )}
                        >
                            <MessageSquare className="h-4 w-4" />
                            WhatsApp
                        </button>

                        <button
                            onClick={() => setActiveTab('email')}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                                activeTab === 'email'
                                    ? "border-blue-500 text-blue-700 bg-white"
                                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            )}
                        >
                            <Mail className="h-4 w-4" />
                            E-mail
                        </button>

                        <button
                            onClick={() => setActiveTab('meetings')}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                                activeTab === 'meetings'
                                    ? "border-purple-500 text-purple-700 bg-white"
                                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                            )}
                        >
                            <Video className="h-4 w-4" />
                            Reuniões
                        </button>

                        {/* Julia IA Toggle + Chat com IA tab — right-aligned */}
                        <div className="flex items-center gap-2 ml-auto">
                            {aiStatus !== undefined && (
                                <button
                                    onClick={toggleAI}
                                    disabled={toggling}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                                        toggling && "opacity-50 cursor-not-allowed",
                                        aiActive
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                            : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                                    )}
                                >
                                    <Bot className="h-3.5 w-3.5" />
                                    {aiActive ? 'Julia IA Ativa' : 'Julia IA Pausada'}
                                </button>
                            )}

                            <button
                                onClick={() => setActiveTab('ai')}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                                    activeTab === 'ai'
                                        ? "border-indigo-500 text-indigo-700 bg-white"
                                        : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                )}
                            >
                                <Sparkles className="h-4 w-4" />
                                Chat com IA
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="p-0">
                        {activeTab === 'whatsapp' && (
                            <div className="h-[400px]">
                                <WhatsAppHistory cardId={cardId} contactId={contactId || null} className="h-full" />
                            </div>
                        )}

                        {activeTab === 'email' && (
                            <div className="p-4 space-y-3">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {emailData?.map((item: any) => (
                                    <div key={item.id} className="border rounded-lg p-3 hover:bg-gray-50">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Mail className="w-4 h-4 text-blue-500" />
                                            <span className="font-medium text-sm">{item.profiles?.nome || 'Sistema'}</span>
                                            <span className="text-xs text-gray-400 ml-auto">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600">{item.descricao}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'meetings' && (
                            <div className="h-[400px]">
                                <MeetingTimeline cardId={cardId} className="h-full" />
                            </div>
                        )}

                        {activeTab === 'ai' && <AIChat cardId={cardId} contactId={contactId} />}
                    </div>
                </div>
            )}
        </div>
    )
}
