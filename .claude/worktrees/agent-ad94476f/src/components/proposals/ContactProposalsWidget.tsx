import { Link } from 'react-router-dom'
import { useContactProposals, useContactProposalStats } from '@/hooks/useContactProposals'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    FileText,
    TrendingUp,
    Eye,
    CheckCircle,
    XCircle,
    Clock,
    Send,
    ArrowRight,
    Loader2,
    Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContactProposalsWidgetProps {
    contactId: string
}

export function ContactProposalsWidget({ contactId }: ContactProposalsWidgetProps) {
    const { data: proposals = [], isLoading } = useContactProposals(contactId)
    const { stats } = useContactProposalStats(contactId)

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'draft': return <FileText className="h-3.5 w-3.5 text-slate-400" />
            case 'sent': return <Send className="h-3.5 w-3.5 text-blue-500" />
            case 'viewed': return <Eye className="h-3.5 w-3.5 text-amber-500" />
            case 'in_progress': return <Clock className="h-3.5 w-3.5 text-purple-500" />
            case 'accepted': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            case 'rejected': return <XCircle className="h-3.5 w-3.5 text-red-500" />
            default: return <FileText className="h-3.5 w-3.5 text-slate-400" />
        }
    }

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            draft: 'Rascunho',
            sent: 'Enviada',
            viewed: 'Visualizada',
            in_progress: 'Em análise',
            accepted: 'Aceita',
            rejected: 'Rejeitada',
            expired: 'Expirada',
        }
        return labels[status] || status
    }

    if (isLoading) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
            </div>
        )
    }

    if (proposals.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-slate-400" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm">Histórico de Propostas</h3>
                </div>
                <p className="text-sm text-slate-500 text-center py-4">
                    Nenhuma proposta encontrada para este contato.
                </p>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 text-sm">Histórico 360°</h3>
                        <p className="text-xs text-slate-400">{stats.totalProposals} proposta(s)</p>
                    </div>
                </div>
                <Link
                    to="/propostas"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                    Ver todas
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-3 text-center">
                    <div className="text-lg font-bold text-slate-900">{stats.totalProposals}</div>
                    <div className="text-[10px] text-slate-400">Total</div>
                </div>
                <div className="p-3 text-center">
                    <div className="text-lg font-bold text-green-600">{stats.acceptedProposals}</div>
                    <div className="text-[10px] text-slate-400">Aceitas</div>
                </div>
                <div className="p-3 text-center">
                    <div className="text-lg font-bold text-purple-600">{stats.conversionRate}%</div>
                    <div className="text-[10px] text-slate-400">Conversão</div>
                </div>
                <div className="p-3 text-center">
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(stats.averageTicket)}</div>
                    <div className="text-[10px] text-slate-400">Ticket Médio</div>
                </div>
            </div>

            {/* Proposals List */}
            <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {proposals.slice(0, 5).map((proposal) => (
                    <Link
                        key={proposal.proposal_id}
                        to={`/proposals/${proposal.proposal_id}/edit`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                        <div className="flex-shrink-0">
                            {getStatusIcon(proposal.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                                {proposal.proposal_title || proposal.card_title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                    proposal.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                        proposal.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                            'bg-slate-100 text-slate-600'
                                )}>
                                    {getStatusLabel(proposal.status)}
                                </span>
                                <span>•</span>
                                <span>
                                    {formatDistanceToNow(new Date(proposal.created_at), {
                                        addSuffix: true,
                                        locale: ptBR
                                    })}
                                </span>
                            </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                            <p className={cn(
                                'text-sm font-medium',
                                proposal.status === 'accepted' ? 'text-green-600' : 'text-slate-900'
                            )}>
                                {formatCurrency(Number(proposal.total_value) || 0)}
                            </p>
                            {proposal.data_viagem_inicio && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(proposal.data_viagem_inicio).toLocaleDateString('pt-BR')}
                                </div>
                            )}
                        </div>
                    </Link>
                ))}
            </div>

            {/* Total Revenue Footer */}
            {stats.totalRevenue > 0 && (
                <div className="px-5 py-3 bg-green-50 border-t border-green-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 font-medium">Total fechado com cliente</span>
                    </div>
                    <span className="font-bold text-green-700">
                        {formatCurrency(stats.totalRevenue)}
                    </span>
                </div>
            )}
        </div>
    )
}
