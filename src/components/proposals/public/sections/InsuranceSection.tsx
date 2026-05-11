/**
 * InsuranceSection - Specialized component for travel insurance
 *
 * Features:
 * - Radio selection for insurance level
 * - Coverage details
 * - Price per person
 */

import { useMemo } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Shield, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeItemForViewer } from '../SmartSection'
import { InsuranceComparisonTable } from '../InsuranceComparisonTable'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface InsuranceSectionProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onSelectItem: (itemId: string) => void
}

export function InsuranceSection({
    items,
    selections,
    onSelectItem,
}: InsuranceSectionProps) {
    // Normalize items to flatten namespaced data
    const normalizedItems = useMemo(
        () => items.map(normalizeItemForViewer),
        [items]
    )

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'USD',
        }).format(Number(value) || 0)

    // Get tier color - handles undefined title safely
    const getTierColor = (title?: string) => {
        const lower = (title || '').toLowerCase()
        if (lower.includes('premium') || lower.includes('gold')) {
            return { bg: 'bg-amber-50', border: 'border-amber-300', icon: 'text-amber-600', ring: 'ring-amber-200' }
        }
        if (lower.includes('completo') || lower.includes('complete')) {
            return { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'text-blue-600', ring: 'ring-blue-200' }
        }
        return { bg: 'bg-slate-50', border: 'border-slate-300', icon: 'text-slate-600', ring: 'ring-slate-200' }
    }

    // Use comparison table when 2+ insurance options
    if (normalizedItems.length >= 2) {
        return (
            <InsuranceComparisonTable
                items={normalizedItems}
                selections={selections}
                onSelectItem={onSelectItem}
            />
        )
    }

    // Single insurance - simple card view
    return (
        <div className="space-y-3">
            {normalizedItems.map((item) => {
                const rich = item.rich_content as Record<string, any> || {}
                const isSelected = selections[item.id]?.selected ?? false
                const price = Number(item.base_price) || 0
                const colors = getTierColor(item.title)

                // Features/coverages list - support both field names
                const features = rich.coverages || rich.features || []

                return (
                    <button
                        key={item.id}
                        onClick={() => onSelectItem(item.id)}
                        className={cn(
                            "w-full text-left p-4 rounded-xl border-2 transition-all",
                            isSelected
                                ? `${colors.bg} ${colors.border} ring-1 ${colors.ring}`
                                : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {/* Radio */}
                            <div className={cn(
                                "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                isSelected
                                    ? `${colors.border.replace('border-', 'border-')} ${colors.bg.replace('bg-', 'bg-').replace('-50', '-600')}`
                                    : "border-slate-300"
                            )}>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>

                            {/* Icon */}
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                isSelected ? `${colors.bg}` : "bg-slate-100"
                            )}>
                                <Shield className={cn(
                                    "h-6 w-6",
                                    isSelected ? colors.icon : "text-slate-400"
                                )} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className={cn(
                                            "font-semibold",
                                            isSelected ? "text-slate-900" : "text-slate-600"
                                        )}>
                                            {item.title}
                                        </p>
                                        {(rich.coverage_amount || rich.coverage) && (
                                            <p className="text-xs text-slate-500">
                                                Cobertura até {rich.coverage_amount || rich.coverage}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className={cn(
                                            "font-bold",
                                            isSelected ? "text-green-600" : "text-slate-600"
                                        )}>
                                            {formatPrice(price)}
                                        </p>
                                        <p className="text-xs text-slate-500">/pessoa</p>
                                    </div>
                                </div>

                                {/* Features */}
                                {features.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        {features.map((feature: string, i: number) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-2 text-xs text-slate-600"
                                            >
                                                <Check className={cn(
                                                    "h-3.5 w-3.5 flex-shrink-0",
                                                    isSelected ? "text-green-500" : "text-slate-400"
                                                )} />
                                                <span>{feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Description fallback */}
                                {features.length === 0 && item.description && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        {item.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
