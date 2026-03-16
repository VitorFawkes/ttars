import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    GitBranch,
    Plus,
    RefreshCw,
    ExternalLink,
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
    Loader2
} from 'lucide-react'
import { useSubCards, type SubCard } from '@/hooks/useSubCards'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import CreateSubCardModal from './CreateSubCardModal'
import MergeSubCardModal from './MergeSubCardModal'

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
    const { subCards, isLoading, cancelSubCard, isCancelling, canMergeSubCard } = useSubCards(parentCardId)

    const [showCreateModal, setShowCreateModal] = useState(false)
    const [selectedSubCardForMerge, setSelectedSubCardForMerge] = useState<SubCard | null>(null)
    const [expandedSection, setExpandedSection] = useState<'active' | 'history' | null>('active')

    const activeSubCards = subCards.filter(sc => sc.sub_card_status === 'active')
    const historySubCards = subCards.filter(sc => sc.sub_card_status !== 'active')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header with create button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">
                        Cards de Alteração
                    </h3>
                    {activeSubCards.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
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
                        Nova Alteração
                    </Button>
                )}
            </div>

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
                                    parentValor={parentValor}
                                    onNavigate={() => navigate(`/cards/${subCard.id}`)}
                                    onMerge={() => canMergeSubCard(subCard) && setSelectedSubCardForMerge(subCard)}
                                    onCancel={(motivo) => cancelSubCard({ subCardId: subCard.id, motivo })}
                                    isCancelling={isCancelling}
                                    canMerge={canMergeSubCard(subCard)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* History Sub-Cards */}
            {historySubCards.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setExpandedSection(expandedSection === 'history' ? null : 'history')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                        <ChevronRight className={cn(
                            'w-3 h-3 transition-transform',
                            expandedSection === 'history' && 'rotate-90'
                        )} />
                        Histórico ({historySubCards.length})
                    </button>

                    {expandedSection === 'history' && (
                        <div className="space-y-2 pl-4">
                            {historySubCards.map(subCard => (
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
                    <GitBranch className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">
                        Nenhum card de alteração
                    </p>
                    {canCreate && (
                        <p className="text-xs text-gray-400 mt-1">
                            Crie um card quando o cliente solicitar mudanças
                        </p>
                    )}
                </div>
            )}

            {/* Modals */}
            <CreateSubCardModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                parentCardId={parentCardId}
                parentTitle={parentTitle}
                parentValor={parentValor}
            />

            {selectedSubCardForMerge && (
                <MergeSubCardModal
                    isOpen={!!selectedSubCardForMerge}
                    onClose={() => setSelectedSubCardForMerge(null)}
                    subCard={selectedSubCardForMerge}
                    parentValor={parentValor}
                    parentCardId={parentCardId}
                />
            )}
        </div>
    )
}

// Sub-components
interface SubCardItemProps {
    subCard: SubCard
    parentValor?: number | null
    onNavigate: () => void
    onMerge: () => void
    onCancel: (motivo?: string) => void
    isCancelling: boolean
    canMerge: boolean
}

function SubCardItem({
    subCard,
    parentValor,
    onNavigate,
    onMerge,
    onCancel,
    isCancelling,
    canMerge
}: SubCardItemProps) {
    const isIncremental = subCard.sub_card_mode === 'incremental'

    const formatCurrency = (value: number | null) => {
        if (value == null) return '-'
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    return (
        <div
            className={cn(
                'p-3 rounded-lg border-l-4 bg-white border shadow-sm',
                isIncremental ? 'border-l-orange-500' : 'border-l-blue-500'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {isIncremental ? (
                            <Plus className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        ) : (
                            <RefreshCw className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        )}
                        <span
                            className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-blue-600"
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
                        <span className={cn(
                            'font-medium',
                            isIncremental ? 'text-orange-600' : 'text-blue-600'
                        )}>
                            {formatCurrency(subCard.valor_final || subCard.valor_estimado)}
                        </span>
                    </div>

                    {/* Preview of merge result */}
                    {canMerge && (
                        <div className={cn(
                            'mt-2 p-2 rounded text-xs',
                            isIncremental ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'
                        )}>
                            {isIncremental ? (
                                <span>
                                    Merge: {formatCurrency(parentValor || 0)} + {formatCurrency(subCard.valor_final || 0)} =
                                    <strong className="ml-1">{formatCurrency((parentValor || 0) + (subCard.valor_final || 0))}</strong>
                                </span>
                            ) : (
                                <span>
                                    Merge: {formatCurrency(parentValor || 0)} → <strong>{formatCurrency(subCard.valor_final || 0)}</strong>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <button
                        onClick={onNavigate}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Abrir card"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>

                    {canMerge && (
                        <button
                            onClick={onMerge}
                            className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded"
                            title="Concluir alteração"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                        </button>
                    )}

                    <button
                        onClick={() => {
                            if (confirm('Tem certeza que deseja cancelar esta alteração?')) {
                                onCancel('Cancelado pelo usuário')
                            }
                        }}
                        disabled={isCancelling}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                        title="Cancelar alteração"
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
    const isMerged = subCard.sub_card_status === 'merged'
    const isIncremental = subCard.sub_card_mode === 'incremental'

    const formatCurrency = (value: number | null) => {
        if (value == null) return '-'
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    return (
        <div
            className={cn(
                'p-2 rounded-lg border bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors',
                isMerged ? 'border-green-200' : 'border-gray-200'
            )}
            onClick={onNavigate}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isMerged ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                        <XCircle className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-600 truncate">
                        {subCard.titulo}
                    </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    {isMerged && subCard.merge_metadata && (
                        <span className={cn(
                            'px-1.5 py-0.5 rounded',
                            isIncremental ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        )}>
                            {isIncremental
                                ? `+${formatCurrency(subCard.merge_metadata.sub_card_value || 0)}`
                                : formatCurrency(subCard.merge_metadata.new_parent_value || 0)
                            }
                        </span>
                    )}
                    <span className={cn(
                        'px-1.5 py-0.5 rounded text-xs',
                        isMerged ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    )}>
                        {isMerged ? 'Concluído' : 'Cancelado'}
                    </span>
                </div>
            </div>
        </div>
    )
}
