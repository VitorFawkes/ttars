import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { usePublicProposal } from '@/hooks/useProposal'
import { usePublicPortal } from '@/hooks/useTripPlanBlocks'
import { ProposalViewRouter } from '@/components/proposals/public/ProposalViewRouter'
import { MobileProposalViewer } from '@/components/proposals/public/mobile'
import { PortalTabs, type PortalTab } from '@/components/trip-plan-portal/PortalTabs'
import { TravelGuideTab } from '@/components/trip-plan-portal/TravelGuideTab'
import { PendingTab } from '@/components/trip-plan-portal/PendingTab'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ProposalView() {
    const { token } = useParams<{ token: string }>()
    const [searchParams] = useSearchParams()
    const forceMobile = searchParams.get('mode') === 'mobile'
    const { data: proposal, isLoading, error } = usePublicProposal(token!)
    const { data: portal } = usePublicPortal(
        proposal?.status === 'accepted' ? token : undefined
    )

    // Default tab: travel se portal tem conteúdo, senão proposal
    const defaultTab = useMemo<PortalTab>(
        () => (portal && portal.blocks.length > 0) ? 'travel' : 'proposal',
        [portal]
    )
    const [activeTab, setActiveTab] = useState<PortalTab>(defaultTab)

    // Sync default tab quando portal carrega pela primeira vez
    const [hasInitialized, setHasInitialized] = useState(false)
    if (!hasInitialized && portal && portal.blocks.length > 0 && activeTab === 'proposal') {
        setActiveTab('travel')
        setHasInitialized(true)
    }

    // Track link opened event
    useEffect(() => {
        if (proposal?.id) {
            supabase.from('proposal_events').insert({
                proposal_id: proposal.id,
                event_type: 'link_opened',
                payload: { token },
                user_agent: navigator.userAgent,
            })
        }
    }, [proposal?.id, token])

    if (isLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-slate-600">Carregando sua proposta...</p>
                </div>
            </div>
        )
    }

    if (error || !proposal) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 to-red-50 p-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-semibold text-slate-900 mb-2">
                        Proposta não encontrada
                    </h1>
                    <p className="text-slate-600 text-sm">
                        Este link pode ter expirado ou a proposta não está mais disponível.
                        Entre em contato com sua consultora para mais informações.
                    </p>
                </div>
            </div>
        )
    }

    // Proposta aceita COM portal → mostrar abas
    if (proposal.status === 'accepted' && portal) {
        const hasTravelGuide = portal.blocks.length > 0
        const pendingCount = portal.pending_count || 0

        return (
            <div className="min-h-dvh bg-slate-50">
                <PortalTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    pendingCount={pendingCount}
                    hasTravelGuide={hasTravelGuide}
                />

                {activeTab === 'proposal' && (
                    <ProposalViewRouter proposal={proposal} />
                )}

                {activeTab === 'travel' && (
                    <TravelGuideTab
                        blocks={portal.blocks}
                        proposalTitle={portal.proposal.title || undefined}
                    />
                )}

                {activeTab === 'pending' && (
                    <PendingTab
                        approvals={portal.approvals}
                        token={token!}
                    />
                )}
            </div>
        )
    }

    // Proposta aceita SEM portal (fallback — portal ainda não criado)
    if (proposal.status === 'accepted') {
        return <ProposalViewRouter proposal={proposal} />
    }

    // Check if expired
    if (proposal.status === 'expired') {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-slate-50 to-amber-50 p-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="h-8 w-8 text-amber-500" />
                    </div>
                    <h1 className="text-xl font-semibold text-slate-900 mb-2">
                        Proposta expirada
                    </h1>
                    <p className="text-slate-600 text-sm">
                        Esta proposta já não está mais válida.
                        Entre em contato com sua consultora para receber uma nova versão.
                    </p>
                </div>
            </div>
        )
    }

    // Force mobile mode if requested via URL param
    if (forceMobile) {
        return <MobileProposalViewer proposal={proposal} />
    }

    // Use router for automatic mobile/desktop detection
    return <ProposalViewRouter proposal={proposal} />
}
