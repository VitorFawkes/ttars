/**
 * SelectableItemCard - Premium card for optional items with toggle switch
 *
 * Features:
 * - Modern toggle switch instead of checkbox
 * - Image thumbnail support
 * - Smooth animations
 * - Touch-friendly 48px+ targets
 * - COMPACT design - essential info only
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { ITEM_TYPE_CONFIG } from '@/types/proposals'
import { Check, Clock, Info, X, MapPin } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice, formatDate } from './utils'
import { ItemDetailModal } from './ItemDetailModal'

interface SelectableItemCardProps {
    item: ProposalItemWithOptions
    isSelected: boolean
    selectedOptionId?: string
    onToggle: () => void
    onSelectOption: (optionId: string) => void
}

export function SelectableItemCard({
    item,
    isSelected,
    selectedOptionId,
    onToggle,
    onSelectOption,
}: SelectableItemCardProps) {
    const [showDetailModal, setShowDetailModal] = useState(false)
    const [imageLoaded, setImageLoaded] = useState(false)

    const config = ITEM_TYPE_CONFIG[item.item_type]
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.Package

    const options = item.options || []
    const hasOptions = options.length > 0
    const basePrice = Number(item.base_price) || 0
    const selectedOption = options.find(o => o.id === selectedOptionId)
    const finalPrice = basePrice + (selectedOption ? Number(selectedOption.price_delta) || 0 : 0)

    // Rich content for additional details
    const richContent = item.rich_content as Record<string, any> || {}
    const hasImage = !!item.image_url

    return (
        <div className={cn(
            "transition-all duration-200 overflow-hidden",
            isSelected ? "bg-white" : "bg-slate-50/80"
        )}>
            {/* Image Header - COMPACT height */}
            {hasImage && (
                <div className={cn(
                    "relative aspect-[3/2] w-full overflow-hidden transition-all",
                    !isSelected && "opacity-60"
                )}>
                    {/* Image placeholder */}
                    {!imageLoaded && (
                        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
                    )}
                    <img
                        src={item.image_url!}
                        alt={item.title}
                        className={cn(
                            "w-full h-full object-cover transition-opacity duration-300",
                            imageLoaded ? "opacity-100" : "opacity-0"
                        )}
                        loading="lazy"
                        onLoad={() => setImageLoaded(true)}
                    />
                    {/* Toggle on image */}
                    <button
                        onClick={onToggle}
                        className={cn(
                            "absolute top-3 right-3 w-14 h-8 rounded-full p-1 transition-all duration-200",
                            isSelected ? "bg-emerald-500" : "bg-slate-200/90 backdrop-blur-sm"
                        )}
                        style={{ touchAction: 'manipulation' }}
                        aria-label={isSelected ? 'Remover' : 'Adicionar'}
                    >
                        <div className={cn(
                            "w-6 h-6 rounded-full bg-white shadow-sm transform transition-all duration-200 flex items-center justify-center",
                            isSelected ? "translate-x-6 scale-110" : "translate-x-0 scale-100"
                        )}>
                            {isSelected ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                                <X className="h-3 w-3 text-slate-400" />
                            )}
                        </div>
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="p-4">
                <div className="flex items-start gap-4">
                    {/* Image Thumbnail OR Icon (when no header image) */}
                    {!hasImage && (
                        <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                            isSelected ? "bg-blue-100 text-blue-600" : "bg-slate-200 text-slate-400"
                        )}>
                            <IconComponent className="h-5 w-5" />
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                {/* Title */}
                                <h3 className={cn(
                                    "font-semibold text-lg leading-tight transition-colors",
                                    isSelected ? "text-slate-900" : "text-slate-500"
                                )}>
                                    {item.title}
                                </h3>

                                {/* Subtitle / Location */}
                                {(richContent.subtitle || richContent.location_city) && (
                                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5" />
                                        {richContent.subtitle || richContent.location_city}
                                    </p>
                                )}
                            </div>

                            {/* Right side: Price + Toggle (when no image) */}
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                {/* Price - Only show if > 0 */}
                                {finalPrice > 0 && (
                                    <div className="text-right">
                                        <p className={cn(
                                            "text-xl font-bold transition-colors",
                                            isSelected ? "text-emerald-600" : "text-slate-400"
                                        )}>
                                            {formatPrice(finalPrice)}
                                        </p>
                                        {richContent.price_per && (
                                            <p className="text-xs text-slate-400">{richContent.price_per}</p>
                                        )}
                                    </div>
                                )}

                                {/* Toggle Switch (when no image) */}
                                {!hasImage && (
                                    <button
                                        onClick={onToggle}
                                        className={cn(
                                            "w-14 h-8 rounded-full p-1 transition-all duration-200 flex-shrink-0",
                                            isSelected ? "bg-emerald-500" : "bg-slate-200"
                                        )}
                                        style={{ touchAction: 'manipulation' }}
                                        aria-label={isSelected ? 'Remover' : 'Adicionar'}
                                    >
                                        <div className={cn(
                                            "w-6 h-6 rounded-full bg-white shadow-sm transform transition-transform duration-200",
                                            isSelected ? "translate-x-6" : "translate-x-0"
                                        )} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Description - Truncated */}
                        {item.description && (
                            <p className={cn(
                                "text-sm mt-2 line-clamp-2 transition-colors",
                                isSelected ? "text-slate-600" : "text-slate-400"
                            )}>
                                {item.description}
                            </p>
                        )}

                        {/* COMPACT Rich Content - Chips */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {/* Duration chip */}
                            {richContent.duration && (
                                <span className={cn(
                                    "px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors",
                                    isSelected ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-500"
                                )}>
                                    <Clock className="h-3 w-3" />
                                    {richContent.duration}
                                </span>
                            )}

                            {/* Date chip */}
                            {richContent.date && (
                                <span className={cn(
                                    "px-2 py-1 text-xs rounded transition-colors",
                                    isSelected ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"
                                )}>
                                    {formatDate(richContent.date)}
                                </span>
                            )}

                            {/* Participants chip */}
                            {richContent.participants && (
                                <span className={cn(
                                    "px-2 py-1 text-xs rounded transition-colors",
                                    isSelected ? "bg-pink-50 text-pink-700" : "bg-slate-100 text-slate-500"
                                )}>
                                    {richContent.participants} pessoas
                                </span>
                            )}

                            {/* Included chip */}
                            {richContent.included && typeof richContent.included === 'string' && (
                                <span className={cn(
                                    "px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors",
                                    isSelected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                                )}>
                                    <Check className="h-3 w-3" />
                                    {richContent.included}
                                </span>
                            )}

                            {/* Custom fields as chips */}
                            {richContent.custom_fields && (richContent.custom_fields as { id: string; label: string; value: string }[]).slice(0, 3).map((field) => (
                                <span
                                    key={field.id}
                                    className={cn(
                                        "px-2 py-1 text-xs rounded transition-colors",
                                        isSelected ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-500"
                                    )}
                                >
                                    {field.value}
                                </span>
                            ))}
                        </div>

                        {/* Notes - Compact */}
                        {richContent.notes && (
                            <div className="mt-2 flex items-start gap-1.5 text-xs">
                                <Info className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" />
                                <span className={cn(
                                    "line-clamp-1 transition-colors",
                                    isSelected ? "text-slate-500" : "text-slate-400"
                                )}>
                                    {richContent.notes}
                                </span>
                            </div>
                        )}

                        {/* Ver mais button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowDetailModal(true)
                            }}
                            className={cn(
                                "mt-3 w-full text-xs font-medium flex items-center justify-center gap-1 py-1.5 rounded-lg transition-colors",
                                isSelected
                                    ? "text-blue-600 hover:text-blue-700 bg-blue-50/50"
                                    : "text-slate-500 hover:text-slate-600 bg-slate-100/50"
                            )}
                        >
                            <Info className="h-3 w-3" />
                            Ver detalhes completos
                        </button>
                    </div>
                </div>
            </div>

            {/* Options - Always visible when available */}
            {hasOptions && (
                <div className="px-4 pb-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Opções disponíveis
                    </p>
                    <div className="space-y-2">
                        {options.map(option => {
                            const isOptionSelected = selectedOptionId === option.id
                            const delta = Number(option.price_delta) || 0
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => onSelectOption(option.id)}
                                    disabled={!isSelected}
                                    className={cn(
                                        "w-full text-left p-3 rounded-xl border-2 transition-all",
                                        isOptionSelected
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-slate-200 hover:border-blue-300",
                                        !isSelected && "opacity-50 cursor-not-allowed"
                                    )}
                                    style={{ touchAction: 'manipulation' }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                                isOptionSelected
                                                    ? "border-blue-600 bg-blue-600"
                                                    : "border-slate-300"
                                            )}>
                                                {isOptionSelected && (
                                                    <div className="w-2 h-2 rounded-full bg-white" />
                                                )}
                                            </div>
                                            <span className="text-sm font-medium text-slate-900">
                                                {option.option_label}
                                            </span>
                                        </div>
                                        <span className={cn(
                                            "text-sm font-semibold",
                                            delta > 0 ? "text-amber-600" : delta < 0 ? "text-emerald-600" : "text-slate-500"
                                        )}>
                                            {delta > 0 ? '+' : ''}{formatPrice(delta)}
                                        </span>
                                    </div>
                                    {option.description && (
                                        <p className="text-xs text-slate-500 mt-1 ml-8">
                                            {option.description}
                                        </p>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Item Detail Modal */}
            <ItemDetailModal
                item={item}
                isOpen={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                isSelected={isSelected}
                onSelect={onToggle}
            />
        </div>
    )
}
