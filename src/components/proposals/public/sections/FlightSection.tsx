/**
 * FlightSection - Refactored to use FlightItinerary for multi-leg display
 *
 * Features:
 * - Uses FlightItinerary for segment-based display
 * - Fallback to simple cards for legacy data
 * - Selection handling
 */

import { useMemo } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Plane, ArrowRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FlightItinerary } from '../FlightItinerary'
import { normalizeItemForViewer } from '../SmartSection'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface FlightSectionProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onSelectItem: (itemId: string) => void
    onSelectOption: (itemId: string, optionId: string) => void
}

export function FlightSection({
    items,
    selections,
    onSelectItem,
}: FlightSectionProps) {
    // Normalize items to flatten namespaced data
    const normalizedItems = useMemo(
        () => items.map(normalizeItemForViewer),
        [items]
    )

    // Check if items have segments (new format) or legacy format
    const hasSegments = useMemo(() => {
        return normalizedItems.some(item => {
            const rich = (item.rich_content as Record<string, any>) || {}
            return Array.isArray(rich.segments) && rich.segments.length > 0
        })
    }, [normalizedItems])

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(Number(value) || 0)

    // If we have segments, render using FlightItinerary
    if (hasSegments) {
        return (
            <div className="space-y-4">
                {normalizedItems.map(item => (
                    <FlightItinerary
                        key={item.id}
                        item={item}
                        isSelected={selections[item.id]?.selected || false}
                        onToggle={() => onSelectItem(item.id)}
                    />
                ))}
            </div>
        )
    }

    // Legacy fallback: simple card display
    return (
        <div className="space-y-3">
            {normalizedItems.map((item, idx) => {
                const rich = (item.rich_content as Record<string, any>) || {}
                const isSelected = selections[item.id]?.selected

                return (
                    <button
                        key={item.id}
                        onClick={() => onSelectItem(item.id)}
                        className={cn(
                            "w-full text-left p-4 rounded-xl border-2 transition-all",
                            isSelected
                                ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                                : "border-slate-200 bg-white hover:border-sky-300"
                        )}
                    >
                        <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                isSelected ? "bg-emerald-100" : "bg-sky-100"
                            )}>
                                <Plane className={cn(
                                    "h-5 w-5",
                                    isSelected ? "text-emerald-600" : "text-sky-600"
                                )} />
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-medium text-slate-800">
                                        {item.title || `Opção ${idx + 1}`}
                                    </p>
                                    <p className={cn(
                                        "font-bold",
                                        isSelected ? "text-emerald-600" : "text-slate-600"
                                    )}>
                                        {formatPrice(item.base_price)}
                                    </p>
                                </div>

                                {/* Route */}
                                {(rich.origin_airport || rich.destination_airport) && (
                                    <div className="mt-2 flex items-center gap-2 text-sm">
                                        <span className="font-medium text-slate-700">
                                            {rich.origin_airport || rich.origin || '---'}
                                        </span>
                                        <ArrowRight className="h-3 w-3 text-slate-400" />
                                        <span className="font-medium text-slate-700">
                                            {rich.destination_airport || rich.destination || '---'}
                                        </span>
                                    </div>
                                )}

                                {/* Time & Class */}
                                {(rich.departure_time || rich.cabin_class) && (
                                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                                        {rich.departure_time && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {rich.departure_time}
                                            </span>
                                        )}
                                        {rich.cabin_class && (
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100">
                                                {rich.cabin_class}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {isSelected && (
                            <div className="mt-3 pt-2 border-t border-emerald-200 text-center">
                                <span className="text-sm text-emerald-600 font-medium">✓ Selecionado</span>
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    )
}
