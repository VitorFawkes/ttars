import { useNavigate } from 'react-router-dom'
import { FileText, ExternalLink, MoreVertical, Pencil, Eye, Trash2, Loader2 } from 'lucide-react'
import type { ProposalWithRelations } from '@/hooks/useProposals'
import { PROPOSAL_STATUS_CONFIG } from '@/types/proposals'
import * as LucideIcons from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ProposalGridProps {
    proposals: ProposalWithRelations[]
    loading: boolean
    hasFilters?: boolean
    onClearFilters?: () => void
}

export function ProposalGrid({ proposals, loading, hasFilters, onClearFilters }: ProposalGridProps) {
    const navigate = useNavigate()

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (proposals.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                    {hasFilters ? 'Nenhuma proposta com esse filtro' : 'Nenhuma proposta encontrada'}
                </h3>
                <p className="text-sm text-slate-500 text-center max-w-sm mb-4">
                    {hasFilters
                        ? 'Tente remover os filtros ou clique no botão abaixo para ver todas as propostas.'
                        : 'Clique em "Carregar Exemplos" no topo da página para criar propostas de demonstração.'}
                </p>
                {hasFilters && onClearFilters && (
                    <button
                        onClick={onClearFilters}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
                    >
                        Limpar Filtros
                    </button>
                )}
            </div>
        )
    }

    const formatDate = (date: string | null) => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    return (
        <div className="grid gap-4 py-4">
            {proposals.map((proposal) => {
                const statusConfig = PROPOSAL_STATUS_CONFIG[proposal.status as keyof typeof PROPOSAL_STATUS_CONFIG] || PROPOSAL_STATUS_CONFIG.draft
                const StatusIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[statusConfig.icon] || LucideIcons.FileText

                return (
                    <div
                        key={proposal.id}
                        onClick={() => navigate(`/proposals/${proposal.id}/edit`)}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 overflow-hidden cursor-pointer"
                    >
                        <div className="p-4 flex items-start gap-4">
                            {/* Icon */}
                            <div className={`p-3 rounded-xl ${statusConfig.bgColor}`}>
                                <StatusIcon className={`h-6 w-6 ${statusConfig.color}`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 className="font-semibold text-gray-900 truncate">
                                            {proposal.active_version?.title || 'Sem título'}
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            Card: <button
                                                onClick={() => navigate(`/cards/${proposal.card_id}`)}
                                                className="text-primary hover:underline"
                                            >
                                                {proposal.card?.titulo || 'Card não encontrado'}
                                            </button>
                                        </p>
                                    </div>

                                    {/* Status Badge */}
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                                        {statusConfig.label}
                                    </span>
                                </div>

                                {/* Meta Info */}
                                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                                    <span>Criada em {formatDate(proposal.created_at)}</span>
                                    {proposal.creator && (
                                        <span>por {proposal.creator.nome || proposal.creator.email}</span>
                                    )}
                                    {proposal.expires_at && (
                                        <span className="text-amber-600">
                                            Expira em {formatDate(proposal.expires_at)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                        <MoreVertical className="h-5 w-5 text-gray-400" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => navigate(`/proposals/${proposal.id}/edit`)}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Editar
                                    </DropdownMenuItem>
                                    {proposal.public_token && (
                                        <DropdownMenuItem onClick={() => window.open(`/p/${proposal.public_token}`, '_blank')}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            Ver Prévia
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => navigate(`/cards/${proposal.card_id}`)}>
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        Abrir Card
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-600">
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
