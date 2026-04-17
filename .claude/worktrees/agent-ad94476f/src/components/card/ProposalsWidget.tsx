import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProposalsByCard, useCreateProposal, useDeleteProposal, useCloneProposal } from '@/hooks/useProposal'
import { PROPOSAL_STATUS_CONFIG } from '@/types/proposals'
import { Button } from '@/components/ui/Button'
import {
    FileText,
    Plus,
    ExternalLink,
    MoreVertical,
    Trash2,
    Eye,
    Clock,
    Loader2,
    Copy,
    AlertCircle,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useStageRequirements, type ProposalRequirement } from '@/hooks/useStageRequirements'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
    draft: 'Criada (Rascunho)',
    sent: 'Enviada',
    viewed: 'Visualizada',
    in_progress: 'Em Andamento',
    accepted: 'Aceita'
}

interface ProposalsWidgetProps {
    cardId: string
    card?: Card
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

export function ProposalsWidget({ cardId, card, isExpanded, onToggleCollapse }: ProposalsWidgetProps) {
    const navigate = useNavigate()
    const [isCreating, setIsCreating] = useState(false)

    const { data: proposals = [], isLoading } = useProposalsByCard(cardId)
    const createProposal = useCreateProposal()
    const deleteProposal = useDeleteProposal()
    const cloneProposal = useCloneProposal()

    // Stage requirements - proposal obligations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { missingBlocking } = useStageRequirements((card || { id: cardId, pipeline_stage_id: null }) as any)
    const missingProposals = missingBlocking
        .filter((r): r is ProposalRequirement => r.requirement_type === 'proposal')

    const handleCreateProposal = async () => {
        setIsCreating(true)
        try {
            const { proposal } = await createProposal.mutateAsync({
                cardId,
                title: 'Nova Proposta',
            })
            toast.success('Proposta criada!', {
                description: 'Redirecionando para o editor...',
            })
            navigate(`/proposals/${proposal.id}/edit`)
        } catch (error) {
            console.error('Error creating proposal:', error)
            toast.error('Erro ao criar proposta', {
                description: 'Tente novamente ou contate o suporte.',
            })
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteProposal = async (proposalId: string) => {
        if (!confirm('Tem certeza que deseja excluir esta proposta?')) return
        try {
            await deleteProposal.mutateAsync(proposalId)
            toast.success('Proposta excluída!')
        } catch (error) {
            console.error('Error deleting proposal:', error)
            toast.error('Erro ao excluir proposta', {
                description: error instanceof Error ? error.message : 'Tente novamente.',
            })
        }
    }

    const handleCopyLink = (token: string) => {
        const url = `${window.location.origin}/p/${token}`
        navigator.clipboard.writeText(url)
        toast.success('Link copiado!')
    }

    const handleCloneProposal = async (proposalId: string, title: string) => {
        try {
            const { proposal } = await cloneProposal.mutateAsync({
                sourceProposalId: proposalId,
                targetCardId: cardId,
                newTitle: `${title} (Cópia)`,
            })
            toast.success('Proposta duplicada!', {
                description: 'Abrindo editor...',
            })
            navigate(`/proposals/${proposal.id}/edit`)
        } catch (error) {
            console.error('Error cloning proposal:', error)
            toast.error('Erro ao duplicar proposta')
        }
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header — clickable to collapse/expand */}
            <div
                className={cn("px-3 py-2 border-b border-slate-100 flex items-center justify-between", onToggleCollapse && "cursor-pointer hover:bg-slate-50/80 transition-colors")}
                onClick={onToggleCollapse}
            >
                <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                    <h3 className="font-medium text-slate-900">Propostas</h3>
                    {proposals.length > 0 && (
                        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                            {proposals.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); handleCreateProposal() }}
                        disabled={isCreating}
                        className="h-7 px-2 text-xs"
                    >
                        {isCreating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <>
                                <Plus className="h-3 w-3 mr-1" />
                                Nova
                            </>
                        )}
                    </Button>
                    {onToggleCollapse && (
                        <SectionCollapseToggle isExpanded={isExpanded ?? true} onToggle={onToggleCollapse} />
                    )}
                </div>
            </div>

            {/* Required proposal indicators */}
            {missingProposals.length > 0 && (
                <div className="border-b border-amber-100 bg-amber-50/50">
                    {missingProposals.map((req, idx) => (
                        <div key={idx} className="px-4 py-2 flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            <span className="text-xs text-amber-800 truncate">
                                <span className="font-medium">Proposta {PROPOSAL_STATUS_LABELS[req.proposal_min_status] || req.proposal_min_status}</span>
                                {' — obrigatória para esta etapa'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="divide-y divide-slate-100">
                {isLoading ? (
                    <div className="p-4 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : proposals.length === 0 ? (
                    <div className="p-6 text-center">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <FileText className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500 mb-3">
                            Nenhuma proposta criada
                        </p>
                        <Button
                            size="sm"
                            onClick={handleCreateProposal}
                            disabled={isCreating}
                        >
                            {isCreating ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Plus className="h-4 w-4 mr-2" />
                            )}
                            Criar Proposta
                        </Button>
                    </div>
                ) : (
                    proposals.map((proposal) => {
                        const statusConfig = PROPOSAL_STATUS_CONFIG[proposal.status as keyof typeof PROPOSAL_STATUS_CONFIG]
                        const timeAgo = formatDistanceToNow(new Date(proposal.created_at!), {
                            addSuffix: true,
                            locale: ptBR,
                        })

                        return (
                            <div
                                key={proposal.id}
                                className="px-4 py-3 hover:bg-slate-50 transition-colors group"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        {/* Title */}
                                        <button
                                            onClick={() => navigate(`/proposals/${proposal.id}/edit`)}
                                            className="font-medium text-slate-900 text-sm hover:text-blue-600 transition-colors text-left truncate block w-full"
                                        >
                                            {proposal.active_version?.title || 'Sem título'}
                                        </button>

                                        {/* Meta */}
                                        <div className="flex items-center gap-2 mt-1">
                                            {/* Viewed indicator */}
                                            {proposal.status === 'viewed' && (
                                                <span className="flex items-center gap-1 text-purple-600" title="Cliente visualizou">
                                                    <Eye className="h-3.5 w-3.5 animate-pulse" />
                                                </span>
                                            )}
                                            <span
                                                className={`text-xs px-1.5 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}
                                            >
                                                {statusConfig.label}
                                            </span>
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {timeAgo}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="p-1 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical className="h-4 w-4 text-slate-400" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => navigate(`/proposals/${proposal.id}/edit`)}
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                                Editar
                                            </DropdownMenuItem>

                                            {proposal.public_token && (
                                                <DropdownMenuItem
                                                    onClick={() => handleCopyLink(proposal.public_token!)}
                                                >
                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                    Copiar Link
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuItem
                                                onClick={() => handleCloneProposal(proposal.id, proposal.active_version?.title || 'Proposta')}
                                                disabled={cloneProposal.isPending}
                                            >
                                                <Copy className="h-4 w-4 mr-2" />
                                                {cloneProposal.isPending ? 'Duplicando...' : 'Duplicar'}
                                            </DropdownMenuItem>

                                            {proposal.status === 'draft' && (
                                                <DropdownMenuItem
                                                    onClick={() => handleDeleteProposal(proposal.id)}
                                                    className="text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Excluir
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
