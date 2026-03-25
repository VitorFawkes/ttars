import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    GitBranch,
    Plus,
    ExternalLink,
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
    Loader2,
    Package
} from 'lucide-react'
import { useSubCards, type SubCard } from '@/hooks/useSubCards'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
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
import CreateSubCardModal from './CreateSubCardModal'

interface SubCardsListProps {
    parentCardId: string
    parentTitle: string
    parentValor?: number | null
    canCreate: boolean
}

export default function SubCardsList({
    parentCardId,
    parentTitle,
    parentValor,
    canCreate
}: SubCardsListProps) {
    const navigate = useNavigate()
    const { subCards, isLoading, cancelSubCard, isCancelling } = useSubCards(parentCardId)

    const [showCreateModal, setShowCreateModal] = useState(false)
    const [expandedSection, setExpandedSection] = useState<'active' | 'history' | 'cancelled' | null>('active')
    const [cancelTarget, setCancelTarget] = useState<string | null>(null)

    const activeSubCards = subCards.filter(sc => sc.sub_card_status === 'active')
    const completedSubCards = subCards.filter(sc => sc.sub_card_status === 'completed')
    const cancelledSubCards = subCards.filter(sc => sc.sub_card_status === 'cancelled' || sc.sub_card_status === 'merged')

    // Calculate aggregated value
    const aggregatedValue = subCards
        .filter(sc => sc.sub_card_agregado_em && (sc.sub_card_status === 'active' || sc.sub_card_status === 'completed'))
        .reduce((sum, sc) => sum + (sc.valor_final || sc.valor_estimado || 0), 0)

    const pendingValue = subCards
        .filter(sc => !sc.sub_card_agregado_em && sc.sub_card_status === 'active')
        .reduce((sum, sc) => sum + (sc.valor_final || sc.valor_estimado || 0), 0)

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {/* Header with create button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                        Produto Extra da Viagem
                    </h3>
                    {activeSubCards.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                            {activeSubCards.length} ativo(s)
                        </span>
                    )}
                </div>

                {canCreate && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCreateModal(true)}
                        className="text-xs"
                    >
                        <Plus className="w-3 h-3 mr-1" />
                        Novo Produto
                    </Button>
                )}
            </div>

            {/* Value Composition */}
            {subCards.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                        <span>Valor base da viagem</span>
                        <span className="font-medium">{formatCurrency(parentValor || 0)}</span>
                    </div>
                    {subCards.filter(sc => sc.sub_card_status === 'active' || sc.sub_card_status === 'completed').map(sc => (
                        <div key={sc.id} className="flex justify-between">
                            <span className={cn(
                                'truncate mr-2',
                                sc.sub_card_agregado_em ? 'text-green-700' : 'text-gray-400'
                            )}>
                                + {sc.titulo}
                                {sc.sub_card_agregado_em
                                    ? ` (agregado ${new Date(sc.sub_card_agregado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })})`
                                    : ' (pendente)'}
                            </span>
                            <span className={cn(
                                'font-medium flex-shrink-0',
                                sc.sub_card_agregado_em ? 'text-green-700' : 'text-gray-400'
                            )}>
                                {formatCurrency(sc.valor_final || sc.valor_estimado || 0)}
                            </span>
                        </div>
                    ))}
                    <div className="border-t border-gray-300 pt-1.5 mt-1.5">
                        <div className="flex justify-between font-semibold text-gray-900">
                            <span>Valor confirmado</span>
                            <span>{formatCurrency((parentValor || 0) + aggregatedValue)}</span>
                        </div>
                        {pendingValue > 0 && (
                            <div className="flex justify-between text-gray-400">
                                <span>Valor potencial (com pendentes)</span>
                                <span>{formatCurrency((parentValor || 0) + aggregatedValue + pendingValue)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Active Sub-Cards */}
            {activeSubCards.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'active' ? null : 'active')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                        <ChevronRight className={cn(
                            'w-3 h-3 transition-transform',
                            expandedSection === 'active' && 'rotate-90'
                        )} />
                        Em Andamento ({activeSubCards.length})
                    </button>

                    {expandedSection === 'active' && (
                        <div className="space-y-2 pl-4">
                            {activeSubCards.map(subCard => (
                                <SubCardItem
                                    key={subCard.id}
                                    subCard={subCard}
                                    onNavigate={() => navigate(`/cards/${subCard.id}`)}
                                    onCancel={() => setCancelTarget(subCard.id)}
                                    isCancelling={isCancelling}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Completed Sub-Cards */}
            {completedSubCards.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'history' ? null : 'history')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        <ChevronRight className={cn(
                            'w-3 h-3 transition-transform',
                            expandedSection === 'history' && 'rotate-90'
                        )} />
                        Concluídos ({completedSubCards.length})
                    </button>

                    {expandedSection === 'history' && (
                        <div className="space-y-2 pl-4">
                            {completedSubCards.map(subCard => (
                                <SubCardHistoryItem
                                    key={subCard.id}
                                    subCard={subCard}
                                    onNavigate={() => navigate(`/cards/${subCard.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Cancelled Sub-Cards */}
            {cancelledSubCards.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'cancelled' ? null : 'cancelled')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
                    >
                        <ChevronRight className={cn(
                            'w-3 h-3 transition-transform',
                            expandedSection === 'cancelled' && 'rotate-90'
                        )} />
                        <XCircle className="w-3 h-3" />
                        Cancelados ({cancelledSubCards.length})
                    </button>

                    {expandedSection === 'cancelled' && (
                        <div className="space-y-2 pl-4">
                            {cancelledSubCards.map(subCard => (
                                <SubCardHistoryItem
                                    key={subCard.id}
                                    subCard={subCard}
                                    onNavigate={() => navigate(`/cards/${subCard.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {subCards.length === 0 && (
                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <Package className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">
                        Nenhum produto extra
                    </p>
                    {canCreate && (
                        <p className="text-xs text-gray-400 mt-1">
                            Adicione quando o cliente solicitar um produto extra
                        </p>
                    )}
                </div>
            )}

            {/* Create Modal */}
            <CreateSubCardModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                parentCardId={parentCardId}
                parentTitle={parentTitle}
                onCreated={(subCardId) => navigate(`/cards/${subCardId}`)}
            />

            {/* Cancel AlertDialog */}
            <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar produto extra</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja cancelar este produto? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (cancelTarget) cancelSubCard({ subCardId: cancelTarget, motivo: 'Cancelado pelo usuário' })
                                setCancelTarget(null)
                            }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Cancelar produto
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// Sub-components
interface SubCardItemProps {
    subCard: SubCard
    onNavigate: () => void
    onCancel: () => void
    isCancelling: boolean
}

function SubCardItem({
    subCard,
    onNavigate,
    onCancel,
    isCancelling
}: SubCardItemProps) {
    const isAggregated = !!subCard.sub_card_agregado_em

    return (
        <div className="p-3 rounded-lg border-l-4 border-l-purple-400 bg-white border shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        <span
                            className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-purple-600"
                            onClick={onNavigate}
                        >
                            {subCard.titulo}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {subCard.etapa_nome}
                        </span>
                        {subCard.dono_nome && (
                            <span>{subCard.dono_nome}</span>
                        )}
                        <span className="font-medium text-purple-600">
                            {formatCurrency(subCard.valor_final || subCard.valor_estimado || 0)}
                        </span>
                    </div>

                    {/* Progress bar */}
                    {subCard.progress_percent != null && (
                        <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all',
                                        isAggregated ? 'bg-green-500' : 'bg-purple-400'
                                    )}
                                    style={{ width: `${Math.min(subCard.progress_percent, 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-gray-400 w-8 text-right">
                                {subCard.progress_percent}%
                            </span>
                        </div>
                    )}

                    {/* Aggregation status */}
                    <div className="mt-1.5">
                        {isAggregated ? (
                            <span className="text-[10px] text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Valor agregado ao card principal
                            </span>
                        ) : (
                            <span className="text-[10px] text-gray-400">
                                Pendente — valor agrega ao entrar em Pós-venda
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <button
                        onClick={onNavigate}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Abrir card"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>

                    <button
                        onClick={onCancel}
                        disabled={isCancelling}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Cancelar produto"
                    >
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

interface SubCardHistoryItemProps {
    subCard: SubCard
    onNavigate: () => void
}

function SubCardHistoryItem({ subCard, onNavigate }: SubCardHistoryItemProps) {
    const isCompleted = subCard.sub_card_status === 'completed' || subCard.sub_card_status === 'merged'

    return (
        <div
            className={cn(
                'p-2 rounded-lg border bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors',
                isCompleted ? 'border-green-200' : 'border-gray-200'
            )}
            onClick={onNavigate}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isCompleted ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                        <XCircle className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-600 truncate">
                        {subCard.titulo}
                    </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-600">
                        {formatCurrency(subCard.valor_final || subCard.valor_estimado || 0)}
                    </span>
                    <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs',
                        isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    )}>
                        {isCompleted ? 'Concluído' : 'Cancelado'}
                    </span>
                </div>
            </div>
        </div>
    )
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value)
}
