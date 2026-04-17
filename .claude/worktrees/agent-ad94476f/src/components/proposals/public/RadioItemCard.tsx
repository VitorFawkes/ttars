/**
 * RadioItemCard - Premium item card with radio button selection
 *
 * Features:
 * - Image thumbnail (when available)
 * - Premium typography with clear hierarchy
 * - Larger touch targets (48px minimum)
 * - Smooth animations
 * - Quantity adjustment for hotels
 * - COMPACT design - essential info only
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { ITEM_TYPE_CONFIG } from '@/types/proposals'
import { Minus, Plus, Check, MapPin, Utensils, Clock, Info } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileImageGallery } from './MobileImageGallery'
import { formatPrice, formatDate } from './utils'
import { ItemDetailModal } from './ItemDetailModal'

interface RadioItemCardProps {
    item: ProposalItemWithOptions
    isSelected: boolean
    selectedOptionId?: string
    onSelect: () => void
    onSelectOption: (optionId: string) => void
    quantity?: number
    onChangeQuantity?: (quantity: number) => void
}

export function RadioItemCard({
    item,
    isSelected,
    selectedOptionId,
    onSelect,
    onSelectOption,
    quantity = 1,
    onChangeQuantity,
}: RadioItemCardProps) {
    const [showDetailModal, setShowDetailModal] = useState(false)
    const config = ITEM_TYPE_CONFIG[item.item_type]
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.Package

    const options = item.options || []
    const hasOptions = options.length > 0
    const basePrice = Number(item.base_price) || 0
    const selectedOption = options.find(o => o.id === selectedOptionId)
    const unitPrice = basePrice + (selectedOption ? Number(selectedOption.price_delta) || 0 : 0)
    const finalPrice = unitPrice * quantity

    // Rich content for additional details
    const richContent = item.rich_content as Record<string, any> || {}
    const quantityUnit = richContent.quantity_unit || 'un'
    const showQuantity = onChangeQuantity && (item.item_type === 'hotel' || richContent.quantity_adjustable)

    // Image handling - supports gallery_urls, images array, or single image_url
    const galleryImages: string[] = (() => {
        const rc = richContent
        // Check for gallery_urls array
        if (Array.isArray(rc.gallery_urls) && rc.gallery_urls.length > 0) {
            return rc.gallery_urls
        }
        // Check for images array
        if (Array.isArray(rc.images) && rc.images.length > 0) {
            return rc.images
        }
        // Fallback to single image
        if (item.image_url) {
            return [item.image_url]
        }
        return []
    })()
    const hasImage = galleryImages.length > 0
    const hasMultipleImages = galleryImages.length > 1

    return (
        <div
            className={cn(
                "transition-all duration-200 overflow-hidden",
                isSelected
                    ? "bg-blue-50/50"
                    : "bg-white hover:bg-slate-50"
            )}
        >
            {/* Main Card - Clickable area */}
            <button
                onClick={onSelect}
                className="w-full text-left"
                style={{ touchAction: 'manipulation' }}
            >
                {/* Image Header - Full width when available */}
                {hasImage && (
                    <div className="relative w-full">
                        {hasMultipleImages ? (
                            // Use MobileImageGallery for multiple images
                            <MobileImageGallery
                                images={galleryImages}
                                altText={item.title}
                                aspectRatio="3/2"
                            />
                        ) : (
                            // Single image fallback - COMPACT height
                            <div className="relative aspect-[3/2] w-full overflow-hidden">
                                <img
                                    src={galleryImages[0]}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        )}
                        {/* Badges de destaque - Canto superior esquerdo */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20 pointer-events-none">
                            {item.is_default_selected && (
                                <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow-lg">
                                    ✓ Recomendado
                                </span>
                            )}
                        </div>
                        {/* Selection indicator */}
                        <div className={cn(
                            "absolute top-3 right-3 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-20",
                            isSelected
                                ? "border-blue-600 bg-blue-600"
                                : "border-white bg-white/80 backdrop-blur-sm"
                        )}>
                            {isSelected && <Check className="h-4 w-4 text-white" />}
                        </div>
                    </div>
                )}

                {/* Content Section */}
                <div className="p-4">
                    {/* Header with radio (when no image) */}
                    <div className="flex items-start gap-3">
                        {/* Radio Button - Only show when no image */}
                        {!hasImage && (
                            <div className={cn(
                                "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0",
                                isSelected
                                    ? "border-blue-600 bg-blue-600"
                                    : "border-slate-300 bg-white"
                            )}>
                                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                        )}

                        {/* Icon (when no image) */}
                        {!hasImage && (
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                isSelected ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"
                            )}>
                                <IconComponent className="h-5 w-5" />
                            </div>
                        )}

                        {/* Title & Price */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                    <h3 className={cn(
                                        "font-semibold text-lg leading-tight",
                                        isSelected ? "text-slate-900" : "text-slate-700"
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

                                    {/* Star Rating - Hotéis */}
                                    {richContent.star_rating && (
                                        <div className="flex items-center gap-0.5 mt-1">
                                            {Array.from({ length: Number(richContent.star_rating) }).map((_, i) => (
                                                <LucideIcons.Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Price */}
                                <div className="text-right flex-shrink-0">
                                    <p className={cn(
                                        "text-xl font-bold",
                                        isSelected ? "text-emerald-600" : "text-slate-600"
                                    )}>
                                        {formatPrice(finalPrice)}
                                    </p>
                                    {quantity > 1 && (
                                        <p className="text-xs text-slate-500">
                                            {formatPrice(unitPrice)}/{quantityUnit}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Description - Truncated */}
                    {item.description && (
                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                            {item.description}
                        </p>
                    )}

                    {/* COMPACT Rich Content - Max 4 items as chips */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {/* Room Type chip */}
                        {richContent.room_type && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded flex items-center gap-1">
                                <LucideIcons.BedDouble className="h-3 w-3" />
                                {richContent.room_type}
                            </span>
                        )}

                        {/* Board Type chip */}
                        {richContent.board_type && (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded flex items-center gap-1">
                                <Utensils className="h-3 w-3" />
                                {richContent.board_type}
                            </span>
                        )}

                        {/* Dates chip - Combined */}
                        {(richContent.check_in_date || richContent.check_out_date) && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                                {formatDate(richContent.check_in_date)} - {formatDate(richContent.check_out_date)}
                            </span>
                        )}

                        {/* Duration chip */}
                        {richContent.duration && (
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {richContent.duration}
                            </span>
                        )}

                        {/* Cabin Class chip */}
                        {richContent.cabin_class && (
                            <span className="px-2 py-1 bg-sky-50 text-sky-700 text-xs rounded">
                                {richContent.cabin_class}
                            </span>
                        )}

                        {/* Amenities - max 3 */}
                        {richContent.amenities && Array.isArray(richContent.amenities) && (
                            <>
                                {(richContent.amenities as string[]).slice(0, 3).map((amenity: string, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                                        {amenity}
                                    </span>
                                ))}
                                {richContent.amenities.length > 3 && (
                                    <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded">
                                        +{richContent.amenities.length - 3}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* Badges Row */}
                    {richContent.cancellation_policy && (
                        <div className="mt-3 flex items-center gap-2 text-xs">
                            <Info className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-slate-500">{richContent.cancellation_policy}</span>
                        </div>
                    )}

                    {/* Ver mais button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setShowDetailModal(true)
                        }}
                        className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1 py-1.5 bg-blue-50/50 rounded-lg"
                    >
                        <Info className="h-3 w-3" />
                        Ver detalhes completos
                    </button>
                </div>
            </button>

            {/* Quantity Adjuster - Below card when selected */}
            {isSelected && showQuantity && (
                <div className="px-4 pb-4">
                    <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg w-fit">
                        <span className="text-sm text-slate-600 capitalize">{quantityUnit}:</span>
                        <button
                            onClick={() => onChangeQuantity?.(Math.max(1, quantity - 1))}
                            className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
                            style={{ touchAction: 'manipulation' }}
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-lg font-semibold text-slate-900">
                            {quantity}
                        </span>
                        <button
                            onClick={() => onChangeQuantity?.(quantity + 1)}
                            className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
                            style={{ touchAction: 'manipulation' }}
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

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
                onSelect={onSelect}
            />
        </div>
    )
}
