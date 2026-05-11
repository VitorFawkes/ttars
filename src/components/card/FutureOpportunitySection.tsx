import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    CalendarClock,
    XCircle,
    ExternalLink,
    CheckCircle2,
    Clock,
    ChevronRight,
    ChevronDown,
    AlertTriangle,
    RotateCcw
} from 'lucide-react'
import { useFutureOpportunities, type FutureOpportunity } from '@/hooks/useFutureOpportunities'
import { cn } from '@/lib/utils'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface FutureOpportunitySectionProps {
    cardId: string
    card?: Card
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

export default function FutureOpportunitySection(props: FutureOpportunitySectionProps) {
    const { cardId, isExpanded = true, onToggleCollapse } = props
    const navigate = useNavigate()
    const {
        pending,
        executed,
        failed,
        isLoading,
        cancel,
        isCancelling,
        retry,
        isRetrying
    } = useFutureOpportunities(cardId)

    const [expandedSection, setExpandedSection] = useState<'pending' | 'executed' | 'failed' | null>(
        'pending'
    )
    const [cancelTarget, setCancelTarget] = useState<string | null>(null)

    const total = pending.length + executed.length + failed.length

    if (isLoading) return null

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5">
            <div className="space-y-3">
                {/* Header */}
                <button
                    onClick={onToggleCollapse}
                    className="flex items-center justify-between w-full"
                >
                    <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Oportunidades Futuras</h3>
                        {pending.length > 0 && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                                {pending.length} agendada(s)
                            </span>
                        )}
                        {failed.length > 0 && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                                {failed.length} falha(s)
                            </span>
                        )}
                    </div>
                    {onToggleCollapse && (
                        <ChevronDown className={cn(
                            'w-4 h-4 text-gray-400 transition-transform',
                            !isExpanded && '-rotate-90'
                        )} />
                    )}
                </button>

                {isExpanded && total === 0 && (
                    <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <CalendarClock className="w-6 h-6 mx-auto text-gray-300 mb-1" />
                        <p className="text-xs text-gray-400">Nenhuma oportunidade agendada</p>
                    </div>
                )}

                {/* Failed */}
                {isExpanded && failed.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'failed' ? null : 'failed')}
                            className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"
                        >
                            <ChevronRight className={cn(
                                'w-3 h-3 transition-transform',
                                expandedSection === 'failed' && 'rotate-90'
                            )} />
                            <AlertTriangle className="w-3 h-3" />
                            Falhou ({failed.length})
                        </button>

                        {expandedSection === 'failed' && (
                            <div className="space-y-2 pl-4">
                                {failed.map(opp => (
                                    <FailedItem
                                        key={opp.id}
                                        opportunity={opp}
                                        onRetry={() => retry(opp.id)}
                                        onCancel={() => setCancelTarget(opp.id)}
                                        isRetrying={isRetrying}
                                        isCancelling={isCancelling}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Pending */}
                {isExpanded && pending.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'pending' ? null : 'pending')}
                            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                            <ChevronRight className={cn(
                                'w-3 h-3 transition-transform',
                                expandedSection === 'pending' && 'rotate-90'
                            )} />
                            Agendadas ({pending.length})
                        </button>

                        {expandedSection === 'pending' && (
                            <div className="space-y-2 pl-4">
                                {pending.map(opp => (
                                    <PendingItem
                                        key={opp.id}
                                        opportunity={opp}
                                        onCancel={() => setCancelTarget(opp.id)}
                                        isCancelling={isCancelling}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Executed */}
                {isExpanded && executed.length > 0 && (
                    <div className="space-y-2">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'executed' ? null : 'executed')}
                            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                            <ChevronRight className={cn(
                                'w-3 h-3 transition-transform',
                                expandedSection === 'executed' && 'rotate-90'
                            )} />
                            Executadas ({executed.length})
                        </button>

                        {expandedSection === 'executed' && (
                            <div className="space-y-2 pl-4">
                                {executed.map(opp => (
                                    <ExecutedItem
                                        key={opp.id}
                                        opportunity={opp}
                                        onNavigate={() => opp.created_card_id && navigate(`/cards/${opp.created_card_id}`)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Cancel AlertDialog */}
            <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar oportunidade futura</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja cancelar esta oportunidade? O card agendado não será criado.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (cancelTarget) cancel(cancelTarget)
                                setCancelTarget(null)
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Cancelar oportunidade
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

function PendingItem({
    opportunity,
    onCancel,
    isCancelling
}: {
    opportunity: FutureOpportunity
    onCancel: () => void
    isCancelling: boolean
}) {
    return (
        <div className="p-3 rounded-lg border-l-4 border-l-blue-500 bg-white border shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <CalendarClock className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                            {opportunity.titulo}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(opportunity.scheduled_date)}</span>
                        {opportunity.sub_card_mode && opportunity.source_type === 'won_future' && (
                            <span className={cn(
                                'px-1.5 py-0.5 rounded text-xs font-medium',
                                opportunity.sub_card_mode === 'incremental'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-blue-100 text-blue-700'
                            )}>
                                {opportunity.sub_card_mode === 'incremental' ? 'Somar valor' : 'Substituir'}
                            </span>
                        )}
                    </div>
                    {opportunity.descricao && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{opportunity.descricao}</p>
                    )}
                </div>
                <button
                    onClick={onCancel}
                    disabled={isCancelling}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                    title="Cancelar agendamento"
                >
                    <XCircle className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

function FailedItem({
    opportunity,
    onRetry,
    onCancel,
    isRetrying,
    isCancelling
}: {
    opportunity: FutureOpportunity
    onRetry: () => void
    onCancel: () => void
    isRetrying: boolean
    isCancelling: boolean
}) {
    const errorMsg = opportunity.metadata?.error

    return (
        <div className="p-3 rounded-lg border-l-4 border-l-red-500 bg-red-50 border border-red-200">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                            {opportunity.titulo}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(opportunity.scheduled_date)}</span>
                    </div>
                    {errorMsg && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">{errorMsg}</p>
                    )}
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={onRetry}
                        disabled={isRetrying}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
                        title="Tentar novamente"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Cancelar"
                    >
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

function ExecutedItem({
    opportunity,
    onNavigate
}: {
    opportunity: FutureOpportunity
    onNavigate: () => void
}) {
    return (
        <div
            className="p-2 rounded-lg border border-green-200 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={onNavigate}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-sm text-gray-600 truncate">{opportunity.titulo}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">{formatDate(opportunity.scheduled_date)}</span>
                    {opportunity.created_card_id && (
                        <ExternalLink className="w-3 h-3 text-gray-400" />
                    )}
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
}
