import { useState, useCallback } from 'react'
import { MessageCircle, List, Gauge, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import WhatsAppOverviewTab from './whatsapp/WhatsAppOverviewTab'
import WhatsAppConversationsTab from './whatsapp/WhatsAppConversationsTab'
import WhatsAppSpeedTab from './whatsapp/WhatsAppSpeedTab'
import WhatsAppTeamTab from './whatsapp/WhatsAppTeamTab'
import type { ConversationStatus } from '@/hooks/analytics/useWhatsAppConversations'

const TABS = [
    { key: 'overview', label: 'Visão Geral', icon: MessageCircle },
    { key: 'conversations', label: 'Conversas', icon: List },
    { key: 'speed', label: 'Velocidade', icon: Gauge },
    { key: 'team', label: 'Equipe & IA', icon: Users },
] as const

type TabKey = typeof TABS[number]['key']

export default function WhatsAppView() {
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [conversationInitialStatus, setConversationInitialStatus] = useState<ConversationStatus | null>(null)

    const navigateToConversations = useCallback((status?: ConversationStatus | null) => {
        setConversationInitialStatus(status ?? null)
        setActiveTab('conversations')
    }, [])

    const navigateToSpeed = useCallback(() => {
        setActiveTab('speed')
    }, [])

    const handleTabChange = useCallback((key: TabKey) => {
        // Clear cross-tab state when manually switching tabs
        if (key !== 'conversations') setConversationInitialStatus(null)
        setActiveTab(key)
    }, [])

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="overflow-x-auto -mx-1 px-1 scrollbar-none">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit shadow-sm">
                    {TABS.map((tab) => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleTabChange(tab.key)}
                                className={cn(
                                    'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                                    activeTab === tab.key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <WhatsAppOverviewTab
                    onNavigateToConversations={navigateToConversations}
                    onNavigateToSpeed={navigateToSpeed}
                />
            )}
            {activeTab === 'conversations' && (
                <WhatsAppConversationsTab initialStatus={conversationInitialStatus} />
            )}
            {activeTab === 'speed' && (
                <WhatsAppSpeedTab onNavigateToConversations={navigateToConversations} />
            )}
            {activeTab === 'team' && (
                <WhatsAppTeamTab onNavigateToConversations={navigateToConversations} />
            )}
        </div>
    )
}
