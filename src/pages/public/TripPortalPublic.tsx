/**
 * TripPortalPublic — Página pública do portal da viagem.
 *
 * Rota: /v/:token (token próprio do trip_plan)
 *
 * Funciona SEM proposta — acessa diretamente o trip_plan pelo seu token.
 * Quando tem proposta vinculada, mostra abas (Proposta + Minha Viagem + Pendente).
 * Quando NÃO tem proposta, mostra apenas o guia da viagem.
 */

import { useParams } from 'react-router-dom'
import { usePublicPortal } from '@/hooks/useTripPlanBlocks'
import { TravelGuideTab } from '@/components/trip-plan-portal/TravelGuideTab'
import { PendingTab } from '@/components/trip-plan-portal/PendingTab'
import { PortalTabs, type PortalTab } from '@/components/trip-plan-portal/PortalTabs'
import { Loader2, AlertCircle } from 'lucide-react'
import { useState } from 'react'

export default function TripPortalPublic() {
    const { token } = useParams<{ token: string }>()
    const { data: portal, isLoading, error } = usePublicPortal(token)

    const [activeTab, setActiveTab] = useState<PortalTab>('travel')

    if (isLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            </div>
        )
    }

    if (error || !portal) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-4">
                <div className="text-center max-w-sm">
                    <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                    <h1 className="text-xl font-semibold text-slate-900 mb-2">
                        Portal não encontrado
                    </h1>
                    <p className="text-sm text-slate-500">
                        Este link pode ter expirado. Entre em contato com sua consultora.
                    </p>
                </div>
            </div>
        )
    }

    const hasBlocks = portal.blocks.length > 0
    const pendingCount = portal.pending_count || 0

    return (
        <div className="min-h-dvh bg-slate-50">
            {/* Abas: só mostra se tem mais de uma aba relevante */}
            {(pendingCount > 0) && (
                <PortalTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    pendingCount={pendingCount}
                    hasTravelGuide={hasBlocks}
                />
            )}

            {activeTab === 'travel' && (
                <TravelGuideTab
                    blocks={portal.blocks}
                    proposalTitle={portal.proposal?.title || undefined}
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
