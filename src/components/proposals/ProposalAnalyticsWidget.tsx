import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import {
    FileText,
    Clock,
    Eye,
    CheckCircle,
    Send,
    AlertTriangle,
    TrendingUp,
    ArrowRight,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { QueryErrorState } from '@/components/ui/QueryErrorState'

interface ProposalStats {
    total: number
    draft: number
    sent: number
    viewed: number
    accepted: number
    rejected: number
    expired: number
    pendingCount: number
    totalValue: number
    conversionRate: number
}

interface PendingProposal {
    id: string
    card_id: string
    card_title: string
    title: string
    status: string
    total_value: number
    created_at: string
    days_pending: number
}

import type { Database } from '@/database.types'

type Product = Database['public']['Enums']['app_product']

interface ProposalAnalyticsWidgetProps {
    productFilter?: Product
}

export function ProposalAnalyticsWidget({ productFilter }: ProposalAnalyticsWidgetProps) {
    const { data: stats, isLoading: loadingStats, isError: errorStats, refetch: refetchStats } = useQuery({
        queryKey: ['proposal-stats-widget', productFilter],
        queryFn: async () => {
            const { data: proposals, error } = await supabase
                .from('proposals')
                .select(`
                    id,
                    status,
                    created_at,
                    card:cards!proposals_card_id_fkey(titulo, produto)
                `)
                .order('created_at', { ascending: false })

            if (error) throw error

            // Filtrar por produto do card associado
            let filtered = proposals || []
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filtered = filtered.filter((p: any) => p.card?.produto === productFilter)
            }

            const stats: ProposalStats = {
                total: filtered.length,
                draft: 0,
                sent: 0,
                viewed: 0,
                accepted: 0,
                rejected: 0,
                expired: 0,
                pendingCount: 0,
                totalValue: 0,
                conversionRate: 0,
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filtered.forEach((p: any) => {
                const status = p.status as keyof typeof stats
                if (status in stats && typeof stats[status] === 'number') {
                    stats[status] = (stats[status] as number) + 1
                }

                if (['sent', 'viewed', 'in_progress'].includes(p.status)) {
                    stats.pendingCount++
                }

                if (p.status === 'accepted') {
                    // total_value missing in DB view/table
                    stats.totalValue += 0
                }
            })

            // Calculate conversion rate
            const sentCount = stats.sent + stats.viewed + stats.accepted + stats.rejected
            if (sentCount > 0) {
                stats.conversionRate = Math.round((stats.accepted / sentCount) * 100)
            }

            return stats
        },
        staleTime: 60000, // 1 min
    })

    const { data: pendingProposals = [], isLoading: loadingPending, isError: errorPending, refetch: refetchPending } = useQuery({
        queryKey: ['pending-proposals-widget'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('proposals')
                .select(`
                    id,
                    card_id,
                    status,
                    created_at,
                    card:cards!proposals_card_id_fkey(titulo),
                    active_version:proposal_versions!fk_proposals_active_version(title)
                `)
                .in('status', ['sent', 'viewed', 'in_progress'])
                .order('created_at', { ascending: false })
                .limit(5)

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).map((p: any) => {
                const createdAt = new Date(p.created_at)
                const now = new Date()
                const diffTime = Math.abs(now.getTime() - createdAt.getTime())
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

                return {
                    id: p.id,
                    card_id: p.card_id,
                    card_title: p.card?.titulo || 'Sem título',
                    title: p.active_version?.title || 'Proposta sem título',
                    status: p.status,
                    total_value: 0, // Column missing
                    created_at: p.created_at,
                    days_pending: diffDays,
                }
            }) as PendingProposal[]
        },
        staleTime: 60000,
    })

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'sent': return <Send className="h-3.5 w-3.5 text-blue-500" />
            case 'viewed': return <Eye className="h-3.5 w-3.5 text-amber-500" />
            case 'in_progress': return <Clock className="h-3.5 w-3.5 text-purple-500" />
            default: return <FileText className="h-3.5 w-3.5 text-slate-400" />
        }
    }



    if (errorStats || errorPending) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <QueryErrorState compact onRetry={() => { refetchStats(); refetchPending() }} />
            </div>
        )
    }

    if (loadingStats || loadingPending) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 text-sm">Propostas</h3>
                        <p className="text-xs text-slate-400">{stats?.pendingCount || 0} pendentes</p>
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

            {/* Quick Stats */}
            <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900">{stats?.total || 0}</div>
                    <div className="text-xs text-slate-400">Total</div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{stats?.accepted || 0}</div>
                    <div className="text-xs text-slate-400">Aceitas</div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{stats?.pendingCount || 0}</div>
                    <div className="text-xs text-slate-400">Pendentes</div>
                </div>
                <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{stats?.conversionRate || 0}%</div>
                    <div className="text-xs text-slate-400">Conversão</div>
                </div>
            </div>

            {/* Pending List */}
            {pendingProposals.length > 0 ? (
                <div className="divide-y divide-slate-50">
                    {pendingProposals.map((proposal) => (
                        <Link
                            key={proposal.id}
                            to={`/proposals/${proposal.id}/edit`}
                            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex-shrink-0">
                                {getStatusIcon(proposal.status)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                    {proposal.card_title}
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 truncate">
                                        {proposal.title}
                                    </span>
                                </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                                <p className="text-sm font-medium text-slate-900">
                                    {formatCurrency(proposal.total_value)}
                                </p>
                                <div className="flex items-center gap-1 justify-end">
                                    {proposal.days_pending > 7 && (
                                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    )}
                                    <span className={cn(
                                        'text-xs',
                                        proposal.days_pending > 7 ? 'text-amber-600' : 'text-slate-400'
                                    )}>
                                        {proposal.days_pending}d
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="p-8 text-center">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 font-medium">Tudo em dia!</p>
                    <p className="text-xs text-slate-400">Nenhuma proposta pendente</p>
                </div>
            )}

            {/* Total Value Footer */}
            {stats && stats.totalValue > 0 && (
                <div className="px-5 py-3 bg-green-50 border-t border-green-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 font-medium">Valor total fechado</span>
                    </div>
                    <span className="font-bold text-green-700">
                        {formatCurrency(stats.totalValue)}
                    </span>
                </div>
            )}
        </div>
    )
}
