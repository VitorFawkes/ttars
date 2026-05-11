import { useState } from 'react'
import { ArrowLeft, Eye, Share2, Loader2, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { cn } from '@/lib/utils'
import type { Proposal } from '@/types/proposals'

interface ProposalEliteHeaderProps {
    proposal: Proposal
    isDirty: boolean
    isSaving: boolean
    isPreview?: boolean
}

/**
 * Elite Header - Premium top bar for proposal editor
 * 
 * Features:
 * - Back navigation
 * - Auto-save status indicator
 * - Preview toggle
 * - Share/publish actions
 */
export function ProposalEliteHeader({
    proposal,
    isDirty,
    isSaving,
    isPreview = false
}: ProposalEliteHeaderProps) {
    const navigate = useNavigate()
    const { publish } = useProposalBuilder()
    const [isPublishing, setIsPublishing] = useState(false)

    const handlePublish = async () => {
        setIsPublishing(true)
        try {
            await publish()
        } finally {
            setIsPublishing(false)
        }
    }

    // Status badge
    const getStatusBadge = () => {
        if (isSaving) {
            return (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Salvando...
                </span>
            )
        }

        if (isDirty) {
            return (
                <span className="flex items-center gap-1.5 text-xs text-amber-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Alterações não salvas
                </span>
            )
        }

        return (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Check className="h-3 w-3" />
                Salvo
            </span>
        )
    }

    // Proposal status badge
    const getProposalStatusBadge = () => {
        const statusConfig: Record<string, { label: string; color: string }> = {
            draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-700' },
            sent: { label: 'Enviada', color: 'bg-blue-100 text-blue-700' },
            viewed: { label: 'Visualizada', color: 'bg-purple-100 text-purple-700' },
            in_progress: { label: 'Em Negociação', color: 'bg-amber-100 text-amber-700' },
            accepted: { label: 'Aceita', color: 'bg-emerald-100 text-emerald-700' },
            rejected: { label: 'Recusada', color: 'bg-red-100 text-red-700' },
        }

        const config = statusConfig[proposal.status] || statusConfig.draft

        return (
            <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                config.color
            )}>
                {config.label}
            </span>
        )
    }

    return (
        <header className="flex-none h-14 px-4 flex items-center justify-between bg-white border-b border-slate-200">
            {/* Left Section */}
            <div className="flex items-center gap-4">
                {/* Back Button */}
                <button
                    onClick={() => navigate('/proposals')}
                    className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-slate-600" />
                </button>

                {/* Proposal Info */}
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            Proposta #{proposal.id.slice(0, 8)}
                            {getProposalStatusBadge()}
                        </h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            {getStatusBadge()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Section - Actions */}
            <div className="flex items-center gap-2">
                {/* Preview Toggle */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const url = new URL(window.location.href)
                        if (isPreview) {
                            url.searchParams.delete('preview')
                        } else {
                            url.searchParams.set('preview', 'true')
                        }
                        navigate(url.pathname + url.search)
                    }}
                    className={cn(
                        isPreview && 'bg-blue-50 border-blue-200 text-blue-700'
                    )}
                >
                    <Eye className="h-4 w-4 mr-2" />
                    {isPreview ? 'Editando' : 'Prévia'}
                </Button>

                {/* Share/Publish Button */}
                <Button
                    onClick={handlePublish}
                    disabled={isPublishing || proposal.status !== 'draft'}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isPublishing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Share2 className="h-4 w-4 mr-2" />
                    )}
                    Enviar para Cliente
                </Button>
            </div>
        </header>
    )
}
