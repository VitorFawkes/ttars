import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useProposal } from '@/hooks/useProposal'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { useAutoSave } from '@/hooks/useAutoSave'
import { ProposalCoverHero } from '@/components/proposals/elite/ProposalCoverHero'
import { ProposalNarrativeEditor } from '@/components/proposals/elite/ProposalNarrativeEditor'
import { ProposalCatalogSection } from '@/components/proposals/elite/ProposalCatalogSection'
import { ProposalPricingSidebar } from '@/components/proposals/elite/ProposalPricingSidebar'
import { ProposalEliteHeader } from '@/components/proposals/elite/ProposalEliteHeader'
import { Button } from '@/components/ui/Button'
import {
    Loader2,
    ArrowLeft,
    Plane,
    Hotel,
    Sparkles,
    Car
} from 'lucide-react'
import { useEffect } from 'react'


/**
 * Elite Proposal Builder - Traviata-inspired visual editor
 * 
 * Features:
 * - Cover hero with image upload
 * - Inline title/subtitle editing
 * - Rich text narrative
 * - Visual catalogs (flights, hotels, experiences)
 * - Real-time pricing sidebar
 * - Auto-save with visual feedback
 */
export default function ProposalBuilderElite() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const isPreview = searchParams.get('preview') === 'true'

    const { data: proposal, isLoading, error } = useProposal(id!)
    const { initialize, reset, isDirty, isSaving } = useProposalBuilder()

    // Current active catalog for adding items
    const [activeCatalog, setActiveCatalog] = useState<'flights' | 'hotels' | 'experiences' | 'transfers' | null>(null)

    // Auto-save
    useAutoSave()

    // Initialize builder
    useEffect(() => {
        if (proposal?.active_version) {
            initialize(
                proposal,
                proposal.active_version,
                proposal.active_version.sections || []
            )
        }
        return () => reset()
    }, [proposal, initialize, reset])

    // Loading state
    if (isLoading) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                    <p className="text-sm text-slate-500 font-medium">Carregando proposta...</p>
                </div>
            </div>
        )
    }

    // Error state
    if (error || !proposal) {
        return (
            <div className="h-dvh flex items-center justify-center bg-slate-50">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">😕</span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-2">
                        Proposta não encontrada
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">
                        A proposta que você está procurando não existe ou foi removida.
                    </p>
                    <Button onClick={() => navigate('/proposals')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar para Propostas
                    </Button>
                </div>
            </div>
        )
    }

    // Catalog configurations
    const catalogs = [
        { id: 'flights' as const, label: 'Voos', icon: Plane, color: 'blue' },
        { id: 'hotels' as const, label: 'Hospedagem', icon: Hotel, color: 'emerald' },
        { id: 'experiences' as const, label: 'Experiências', icon: Sparkles, color: 'amber' },
        { id: 'transfers' as const, label: 'Transfers', icon: Car, color: 'purple' },
    ]

    return (
        <div className="h-dvh flex flex-col bg-slate-50 overflow-hidden">
            {/* Elite Header */}
            <ProposalEliteHeader
                proposal={proposal}
                isDirty={isDirty}
                isSaving={isSaving}
                isPreview={isPreview}
            />

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex">
                {/* Left: Editor Area (Scrollable) */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto py-8 px-6">
                        {/* Cover Hero Section */}
                        <ProposalCoverHero
                            proposal={proposal}
                            isPreview={isPreview}
                        />

                        {/* Narrative Section */}
                        <div className="mt-8">
                            <ProposalNarrativeEditor
                                isPreview={isPreview}
                            />
                        </div>

                        {/* Catalog Sections */}
                        <div className="mt-8 space-y-6">
                            {catalogs.map((catalog) => (
                                <ProposalCatalogSection
                                    key={catalog.id}
                                    type={catalog.id}
                                    label={catalog.label}
                                    icon={catalog.icon}
                                    color={catalog.color}
                                    isActive={activeCatalog === catalog.id}
                                    onActivate={() => setActiveCatalog(
                                        activeCatalog === catalog.id ? null : catalog.id
                                    )}
                                    isPreview={isPreview}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Pricing Sidebar (Fixed) */}
                <div className="w-80 border-l border-slate-200 bg-white flex-shrink-0 overflow-y-auto">
                    <ProposalPricingSidebar
                        proposal={proposal}
                        isPreview={isPreview}
                    />
                </div>
            </div>
        </div>
    )
}
