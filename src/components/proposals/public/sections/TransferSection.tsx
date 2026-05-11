/**
 * TransferSection - Specialized component for transfers
 *
 * Features:
 * - Toggle for each transfer (opcional)
 * - Clear origin/destination
 * - Date display
 * - Vehicle type
 */

import { useMemo } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Bus, MapPin, ArrowRight, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeItemForViewer } from '../SmartSection'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface TransferSectionProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onToggleItem: (itemId: string) => void
}

export function TransferSection({
    items,
    selections,
    onToggleItem,
}: TransferSectionProps) {
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

    const formatDate = (dateStr?: string): string => {
        if (!dateStr) return ''
        try {
            const date = new Date(dateStr)
            return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                weekday: 'short'
            })
        } catch {
            return dateStr
        }
    }

    return (
        <div className="space-y-2">
            {normalizedItems.map(item => {
                const rich = item.rich_content as Record<string, any> || {}
                const isSelected = selections[item.id]?.selected ?? false
                const price = Number(item.base_price) || 0

                return (
                    <div
                        key={item.id}
                        className={cn(
                            "p-4 rounded-xl border transition-all",
                            isSelected
                                ? "border-teal-300 bg-teal-50/50"
                                : "border-slate-200 bg-white opacity-60"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {/* Toggle Switch */}
                            <button
                                onClick={() => onToggleItem(item.id)}
                                className={cn(
                                    "mt-0.5 w-11 h-6 rounded-full transition-all flex-shrink-0 relative",
                                    isSelected ? "bg-teal-500" : "bg-slate-300"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                                    isSelected ? "left-5" : "left-0.5"
                                )} />
                            </button>

                            {/* Icon */}
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                isSelected ? "bg-teal-100 text-teal-600" : "bg-slate-100 text-slate-400"
                            )}>
                                <Bus className="h-5 w-5" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className={cn(
                                            "font-medium",
                                            isSelected ? "text-slate-900" : "text-slate-500"
                                        )}>
                                            {item.title}
                                        </p>

                                        {/* Route */}
                                        {(rich.origin || rich.destination) && (
                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                <MapPin className="h-3 w-3" />
                                                <span>{rich.origin || '---'}</span>
                                                <ArrowRight className="h-3 w-3" />
                                                <span>{rich.destination || '---'}</span>
                                            </div>
                                        )}

                                        {/* Date & Vehicle */}
                                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                            {rich.date && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDate(rich.date)}
                                                </span>
                                            )}
                                            {rich.vehicle_type && (
                                                <span className="text-slate-400">{rich.vehicle_type}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <p className={cn(
                                        "font-semibold text-sm",
                                        isSelected ? "text-green-600" : "text-slate-400"
                                    )}>
                                        {isSelected ? `+ ${formatPrice(price)}` : formatPrice(price)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
