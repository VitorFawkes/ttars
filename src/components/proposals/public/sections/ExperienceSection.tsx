/**
 * ExperienceSection - Specialized component for experiences/tours
 *
 * Features:
 * - Group by date
 * - Time and location display
 * - Duration indicator
 * - Optional toggle
 */

import { useMemo } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Star, Calendar, MapPin, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeItemForViewer } from '../SmartSection'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface ExperienceSectionProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onToggleItem: (itemId: string) => void
}

interface DateGroup {
    date: string
    formattedDate: string
    location?: string
    items: ProposalItemWithOptions[]
}

function formatDateLong(dateStr?: string): string {
    if (!dateStr) return 'A definir'
    try {
        const date = new Date(dateStr)
        return date.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long'
        })
    } catch {
        return dateStr
    }
}

export function ExperienceSection({
    items,
    selections,
    onToggleItem,
}: ExperienceSectionProps) {
    // Normalize items to flatten namespaced data
    const normalizedItems = useMemo(
        () => items.map(normalizeItemForViewer),
        [items]
    )

    // Group by date (using normalized items)
    const dateGroups = useMemo<DateGroup[]>(() => {
        const byDate = new Map<string, ProposalItemWithOptions[]>()

        normalizedItems.forEach(item => {
            const rich = item.rich_content as Record<string, any> || {}
            const date = rich.date || 'no-date'
            if (!byDate.has(date)) byDate.set(date, [])
            byDate.get(date)!.push(item)
        })

        return Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dateItems]) => {
                const firstItem = dateItems[0]
                const rich = firstItem.rich_content as Record<string, any> || {}
                return {
                    date,
                    formattedDate: formatDateLong(date === 'no-date' ? undefined : date),
                    location: rich.location_city || rich.city,
                    items: dateItems
                }
            })
    }, [items])

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'USD',
        }).format(Number(value) || 0)

    return (
        <div className="space-y-6">
            {dateGroups.map(group => (
                <div key={group.date}>
                    {/* Date Header */}
                    {dateGroups.length > 1 && (
                        <div className="flex items-center gap-2 px-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                <Calendar className="h-4 w-4 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900 capitalize">
                                    {group.formattedDate}
                                </p>
                                {group.location && (
                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {group.location}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Experiences */}
                    <div className="space-y-2">
                        {group.items.map(item => {
                            const rich = item.rich_content as Record<string, any> || {}
                            const isSelected = selections[item.id]?.selected ?? false
                            const price = Number(item.base_price) || 0

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "p-4 rounded-xl border transition-all",
                                        isSelected
                                            ? "border-orange-300 bg-orange-50/50"
                                            : "border-slate-200 bg-white opacity-60"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Toggle Switch */}
                                        <button
                                            onClick={() => onToggleItem(item.id)}
                                            className={cn(
                                                "mt-0.5 w-11 h-6 rounded-full transition-all flex-shrink-0 relative",
                                                isSelected ? "bg-orange-500" : "bg-slate-300"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                                                isSelected ? "left-5" : "left-0.5"
                                            )} />
                                        </button>

                                        {/* Image or Icon */}
                                        <div className={cn(
                                            "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden",
                                            isSelected ? "bg-orange-100" : "bg-slate-100"
                                        )}>
                                            {item.image_url ? (
                                                <img
                                                    src={item.image_url}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Star className={cn(
                                                    "h-6 w-6",
                                                    isSelected ? "text-orange-600" : "text-slate-400"
                                                )} />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={cn(
                                                    "font-medium",
                                                    isSelected ? "text-slate-900" : "text-slate-500"
                                                )}>
                                                    {item.title}
                                                </p>
                                                <p className={cn(
                                                    "font-semibold text-sm flex-shrink-0",
                                                    isSelected ? "text-green-600" : "text-slate-400"
                                                )}>
                                                    {isSelected ? `+ ${formatPrice(price)}` : formatPrice(price)}
                                                </p>
                                            </div>

                                            {/* Meta */}
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                {rich.time && (
                                                    <span className={cn(
                                                        "flex items-center gap-1 px-2 py-0.5 rounded-full",
                                                        isSelected
                                                            ? "bg-orange-100 text-orange-700"
                                                            : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        <Clock className="h-3 w-3" />
                                                        {rich.time}
                                                    </span>
                                                )}
                                                {rich.duration && (
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded-full",
                                                        isSelected
                                                            ? "bg-slate-200 text-slate-700"
                                                            : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        {rich.duration}
                                                    </span>
                                                )}
                                                {rich.group_size && (
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                        👥 {rich.group_size}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Location */}
                                            {rich.meeting_point && (
                                                <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />
                                                    {rich.meeting_point}
                                                </p>
                                            )}

                                            {/* Description */}
                                            {item.description && (
                                                <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
