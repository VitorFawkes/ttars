/**
 * HotelSection - Specialized component for hotel display
 *
 * Features:
 * - Group by city/destination
 * - Multiple hotel options per city
 * - Room type, board, cancellation policy
 * - Date range display
 * - Quantity controls (nights, rooms)
 */

import { useMemo, useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Building2, Calendar, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeItemForViewer } from '../SmartSection'
import { HotelComparisonTable } from '../HotelComparisonTable'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface HotelSectionProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onSelectItem: (itemId: string) => void
    onSelectOption: (itemId: string, optionId: string) => void
    onChangeQuantity: (itemId: string, quantity: number) => void
}

interface CityGroup {
    city: string
    dateRange?: string
    items: ProposalItemWithOptions[]
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return ''
    try {
        const date = new Date(dateStr)
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    } catch {
        return dateStr
    }
}

function getDateRange(items: ProposalItemWithOptions[]): string | undefined {
    const checkIns = items
        .map(i => {
            const rc = i.rich_content as any
            return rc?.check_in_date || rc?.hotel?.check_in_date
        })
        .filter(Boolean)
    const checkOuts = items
        .map(i => {
            const rc = i.rich_content as any
            return rc?.check_out_date || rc?.hotel?.check_out_date
        })
        .filter(Boolean)

    if (checkIns.length === 0) return undefined

    const minDate = formatDate(checkIns[0])
    const maxDate = checkOuts.length > 0 ? formatDate(checkOuts[0]) : formatDate(checkIns[0])

    return `${minDate} - ${maxDate}`
}

export function HotelSection({
    items,
    selections,
    onSelectItem,
    onSelectOption,
    onChangeQuantity,
}: HotelSectionProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

    // Normalize items to flatten namespaced data (hotel, flights, etc)
    const normalizedItems = useMemo(
        () => items.map(normalizeItemForViewer),
        [items]
    )

    // Group hotels by city (using normalized items)
    const cityGroups = useMemo<CityGroup[]>(() => {
        const byCity = new Map<string, ProposalItemWithOptions[]>()

        normalizedItems.forEach(item => {
            const rich = item.rich_content as Record<string, any> || {}
            const city = rich.location_city || rich.city || 'Hospedagem'
            if (!byCity.has(city)) byCity.set(city, [])
            byCity.get(city)!.push(item)
        })

        return Array.from(byCity.entries()).map(([city, cityItems]) => ({
            city,
            dateRange: getDateRange(cityItems),
            items: cityItems
        }))
    }, [normalizedItems])

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'USD',
        }).format(Number(value) || 0)

    const toggleExpand = (itemId: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev)
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return next
        })
    }

    return (
        <div className="space-y-6">
            {cityGroups.map(group => (
                <div key={group.city}>
                    {/* Use comparison table when 2+ hotels in group */}
                    {group.items.length >= 2 ? (
                        <HotelComparisonTable
                            items={group.items}
                            selections={selections}
                            onSelectItem={onSelectItem}
                            cityGroup={cityGroups.length > 1 ? group.city : undefined}
                            dateRange={group.dateRange}
                        />
                    ) : (
                        <>
                            {/* City Header - Only show for single hotel when multiple groups */}
                            {cityGroups.length > 1 && (
                                <div className="flex items-center gap-2 px-2 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                        <Building2 className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{group.city}</p>
                                        {group.dateRange && (
                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {group.dateRange}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Single hotel - Simple card view */}
                            <div className="space-y-2">
                        {group.items.map((item, idx) => {
                            const rich = item.rich_content as Record<string, any> || {}
                            const sel = selections[item.id]
                            const isSelected = sel?.selected ?? false
                            const quantity = sel?.quantity ?? 1
                            const hasMultiple = group.items.length > 1
                            const isExpanded = expandedItems.has(item.id)

                            const unitPrice = Number(item.base_price) || 0
                            const totalPrice = unitPrice * quantity

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "rounded-xl border transition-all overflow-hidden",
                                        isSelected
                                            ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200"
                                            : "border-slate-200 bg-white"
                                    )}
                                >
                                    {/* Main Card */}
                                    <button
                                        onClick={() => hasMultiple && onSelectItem(item.id)}
                                        className={cn(
                                            "w-full text-left p-4",
                                            hasMultiple && "cursor-pointer"
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Radio (if multiple) */}
                                            {hasMultiple && (
                                                <div className={cn(
                                                    "mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                                                    isSelected
                                                        ? "border-blue-600 bg-blue-600"
                                                        : "border-slate-300"
                                                )}>
                                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                </div>
                                            )}

                                            {/* Hotel Image or Icon */}
                                            <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {item.image_url ? (
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Building2 className="h-8 w-8 text-slate-400" />
                                                )}
                                            </div>

                                            {/* Hotel Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="font-medium text-slate-900">
                                                            {item.title || `Hotel ${idx + 1}`}
                                                        </p>
                                                        {rich.room_type && (
                                                            <p className="text-xs text-blue-600">{rich.room_type}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={cn(
                                                            "font-semibold",
                                                            isSelected ? "text-green-600" : "text-slate-600"
                                                        )}>
                                                            {formatPrice(totalPrice)}
                                                        </p>
                                                        {quantity > 1 && (
                                                            <p className="text-xs text-slate-500">
                                                                {quantity} {rich.quantity_unit || 'noites'}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Tags */}
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {rich.board_type && (
                                                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                                            {rich.board_type}
                                                        </span>
                                                    )}
                                                    {rich.cancellation_policy && (
                                                        <span className={cn(
                                                            "px-2 py-0.5 text-xs rounded-full",
                                                            rich.cancellation_policy.toLowerCase().includes('reembolsável')
                                                                ? "bg-emerald-100 text-emerald-700"
                                                                : "bg-amber-100 text-amber-700"
                                                        )}>
                                                            {rich.cancellation_policy}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Quantity Controls (when selected) */}
                                    {isSelected && (
                                        <div className="px-4 pb-4 flex items-center justify-between border-t border-slate-100 pt-3">
                                            <span className="text-sm text-slate-600">
                                                {rich.quantity_unit === 'quartos' ? 'Quartos' : 'Diárias'}:
                                            </span>
                                            <div className="flex items-center gap-0 bg-slate-100 rounded-lg">
                                                <button
                                                    onClick={() => onChangeQuantity(item.id, Math.max(1, quantity - 1))}
                                                    className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-l-lg transition-colors"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </button>
                                                <span className="w-10 text-center font-medium text-slate-900">
                                                    {quantity}
                                                </span>
                                                <button
                                                    onClick={() => onChangeQuantity(item.id, quantity + 1)}
                                                    className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-r-lg transition-colors"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Expand Details */}
                                    {(item.description || (item.options || []).length > 0) && (
                                        <>
                                            <button
                                                onClick={() => toggleExpand(item.id)}
                                                className="w-full px-4 py-2 text-xs text-blue-600 flex items-center justify-center gap-1 border-t border-slate-100 hover:bg-slate-50"
                                            >
                                                {isExpanded ? 'Ver menos' : 'Ver detalhes'}
                                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                            </button>

                                            {isExpanded && (
                                                <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
                                                    {item.description && (
                                                        <p className="text-sm text-slate-600 pt-3">
                                                            {item.description}
                                                        </p>
                                                    )}

                                                    {/* Options */}
                                                    {(item.options || []).length > 0 && (
                                                        <div className="space-y-2 pt-2">
                                                            <p className="text-xs font-medium text-slate-500 uppercase">Upgrades</p>
                                                            {(item.options || []).map(option => {
                                                                const isOptSelected = sel?.optionId === option.id
                                                                const delta = Number(option.price_delta) || 0
                                                                return (
                                                                    <button
                                                                        key={option.id}
                                                                        onClick={() => onSelectOption(item.id, option.id)}
                                                                        disabled={!isSelected}
                                                                        className={cn(
                                                                            "w-full text-left p-3 rounded-lg border transition-all",
                                                                            isOptSelected
                                                                                ? "border-blue-300 bg-blue-50"
                                                                                : "border-slate-200 hover:border-blue-200",
                                                                            !isSelected && "opacity-50 cursor-not-allowed"
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className={cn(
                                                                                    "w-4 h-4 rounded-full border-2",
                                                                                    isOptSelected
                                                                                        ? "border-blue-600 bg-blue-600"
                                                                                        : "border-slate-300"
                                                                                )}>
                                                                                    {isOptSelected && <div className="w-1.5 h-1.5 rounded-full bg-white m-auto mt-0.5" />}
                                                                                </div>
                                                                                <span className="text-sm font-medium">{option.option_label}</span>
                                                                            </div>
                                                                            <span className={cn(
                                                                                "text-sm font-medium",
                                                                                delta > 0 ? "text-amber-600" : "text-green-600"
                                                                            )}>
                                                                                {delta > 0 ? '+' : ''}{formatPrice(delta)}
                                                                            </span>
                                                                        </div>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )
                        })}
                            </div>
                        </>
                    )}
                </div>
            ))}
        </div>
    )
}
