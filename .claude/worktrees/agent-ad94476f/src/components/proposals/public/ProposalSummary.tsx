/**
 * ProposalSummary - Desktop sidebar with selections and total
 * 
 * Features:
 * - Sticky sidebar on desktop
 * - Selected items list
 * - Real-time total
 * - Accept button
 */

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface SummaryItem {
    id: string
    title: string
    price: number
    quantity?: number
}

interface ProposalSummaryProps {
    items: SummaryItem[]
    selections: Record<string, Selection>
    total: number
    secondaryTotal?: number
    primaryCurrency: string
    secondaryCurrency?: string
    onAccept: () => void
}

export function ProposalSummary({
    items,
    selections,
    total,
    secondaryTotal,
    primaryCurrency,
    secondaryCurrency,
    onAccept,
}: ProposalSummaryProps) {
    const formatPrice = (value: number, currency: string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency,
        }).format(value)

    const selectedItems = useMemo(() => {
        return items.filter(item => selections[item.id]?.selected)
    }, [items, selections])

    return (
        <div className="hidden lg:block w-[320px] flex-shrink-0 border-l border-slate-200 bg-white">
            <div className="sticky top-0 h-screen overflow-y-auto">
                <div className="p-6">
                    {/* Header */}
                    <h2 className="text-lg font-bold text-slate-900 mb-4">
                        Resumo
                    </h2>

                    {/* Selected items */}
                    <div className="space-y-3 mb-6">
                        {selectedItems.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">
                                Nenhum item selecionado
                            </p>
                        ) : (
                            selectedItems.map(item => (
                                <div
                                    key={item.id}
                                    className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                                >
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Check className="h-3 w-3 text-green-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                            {item.title}
                                        </p>
                                        {item.quantity && item.quantity > 1 && (
                                            <p className="text-xs text-slate-500">
                                                {item.quantity}x
                                            </p>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-slate-900 flex-shrink-0">
                                        {formatPrice(item.price * (item.quantity || 1), primaryCurrency)}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-200 my-4" />

                    {/* Total */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-600">Total</span>
                            <span className="text-2xl font-bold text-slate-900">
                                {formatPrice(total, primaryCurrency)}
                            </span>
                        </div>
                        {secondaryTotal && secondaryCurrency && (
                            <p className="text-right text-xs text-slate-500">
                                ≈ {formatPrice(secondaryTotal, secondaryCurrency)}
                            </p>
                        )}
                    </div>

                    {/* CTA */}
                    <Button
                        onClick={onAccept}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3"
                    >
                        Confirmar Proposta
                    </Button>

                    <p className="text-center text-xs text-slate-400 mt-3">
                        Esta ação não gera cobranças
                    </p>
                </div>
            </div>
        </div>
    )
}
