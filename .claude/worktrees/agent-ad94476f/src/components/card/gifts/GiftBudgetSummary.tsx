import { cn } from '@/lib/utils'

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

interface GiftBudgetSummaryProps {
    totalCost: number
    budget: number | null
    itemCount: number
}

export default function GiftBudgetSummary({ totalCost, budget, itemCount }: GiftBudgetSummaryProps) {
    const hasBudget = budget != null && budget > 0
    const percentage = hasBudget ? Math.min((totalCost / budget!) * 100, 100) : 0
    const isOver = hasBudget && totalCost > budget!

    return (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
                <span className="text-sm font-semibold text-slate-900">{formatBRL(totalCost)}</span>
            </div>

            {hasBudget && (
                <>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all',
                                isOver ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <span className={cn(
                            'font-medium',
                            isOver ? 'text-red-600' : 'text-slate-500'
                        )}>
                            {isOver ? `Excede budget em ${formatBRL(totalCost - budget!)}` : `${percentage.toFixed(0)}% do budget`}
                        </span>
                        <span className="text-slate-400">Budget: {formatBRL(budget!)}</span>
                    </div>
                </>
            )}
        </div>
    )
}
