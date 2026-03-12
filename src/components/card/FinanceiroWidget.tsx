import { useState } from 'react'
import { DollarSign, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCollapseToggle } from './DynamicSectionWidget'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useReceitaPermission } from '@/hooks/useReceitaPermission'
import CostEditorModal from './CostEditorModal'
import FinancialItemsModal from './FinancialItemsModal'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

interface FinanceiroWidgetProps {
    cardId: string
    card: Card
    /** Collapse support — passed by CollapsibleWidgetSection */
    isExpanded?: boolean
    onToggleCollapse?: () => void
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function FinanceiroWidget({ cardId, card, isExpanded, onToggleCollapse }: FinanceiroWidgetProps) {
    const receitaPerm = useReceitaPermission()
    const [showCostEditor, setShowCostEditor] = useState(false)
    const [showFinancialItems, setShowFinancialItems] = useState(false)

    const { data: acceptedProposal } = useQuery({
        queryKey: ['card-accepted-proposal', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('proposals')
                .select('id, status')
                .eq('card_id', cardId)
                .eq('status', 'accepted')
                .limit(1)
                .maybeSingle()
            if (error) return null
            return data
        },
        enabled: !!cardId,
    })

    if (!receitaPerm.canView) return null

    return (
        <>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Header — clickable to collapse/expand */}
                <div
                    className={cn("flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50/50", onToggleCollapse && "cursor-pointer hover:bg-gray-100/50 transition-colors")}
                    onClick={onToggleCollapse}
                >
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-amber-600" />
                        Financeiro
                    </h3>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {acceptedProposal ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                                Proposta
                            </span>
                        ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">
                                Manual
                            </span>
                        )}
                        {receitaPerm.canEdit && (
                            <button
                                onClick={() => acceptedProposal ? setShowCostEditor(true) : setShowFinancialItems(true)}
                                className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                            >
                                {acceptedProposal ? 'Editar custos' : 'Editar produtos'}
                            </button>
                        )}
                        {onToggleCollapse && (
                            <SectionCollapseToggle isExpanded={isExpanded ?? true} onToggle={onToggleCollapse} />
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="px-4 pb-4">
                {/* Valor de Venda */}
                {card.valor_final != null && (
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs text-gray-500">Valor de Venda</span>
                        <span className="text-lg font-bold text-gray-900">
                            {formatBRL(Number(card.valor_final))}
                        </span>
                    </div>
                )}

                {/* Receita */}
                <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Receita
                    </span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-amber-700">
                            {card.receita != null
                                ? formatBRL(Number(card.receita))
                                : '—'}
                        </span>
                        {card.valor_final != null && card.receita != null && Number(card.valor_final) > 0 && (
                            <span className="text-xs text-gray-400">
                                {((Number(card.receita) / Number(card.valor_final)) * 100).toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Investimento (referencia) */}
                {card.valor_estimado != null && (
                    <div className="flex items-baseline justify-between pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-400">Investimento</span>
                        <span className="text-sm text-gray-400">
                            {formatBRL(card.valor_estimado)}
                        </span>
                    </div>
                )}
                </div>
            </div>

            {/* Financial Modals */}
            <CostEditorModal
                isOpen={showCostEditor}
                onClose={() => setShowCostEditor(false)}
                cardId={cardId}
            />
            <FinancialItemsModal
                isOpen={showFinancialItems}
                onClose={() => setShowFinancialItems(false)}
                cardId={cardId}
            />
        </>
    )
}
