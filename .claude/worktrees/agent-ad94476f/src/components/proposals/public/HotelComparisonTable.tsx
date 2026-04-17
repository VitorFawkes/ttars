/**
 * HotelComparisonTable - Tabela comparativa de hotéis estilo Booking.com
 *
 * Features:
 * - Mobile: Cards horizontais com scroll snap
 * - Desktop: Tabela grid completa
 * - Seleção com visual highlight
 * - Acessibilidade (role="table", headers)
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import {
    Star,
    Utensils,
    Check,
    Building2,
    Calendar,
    Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice } from './utils'
import { ItemDetailModal } from './ItemDetailModal'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface HotelComparisonTableProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onSelectItem: (itemId: string) => void
    cityGroup?: string
    dateRange?: string
}

const BOARD_TYPE_LABELS: Record<string, string> = {
    room_only: 'Somente Quarto',
    breakfast: 'Café da Manhã',
    half_board: 'Meia Pensão',
    full_board: 'Pensão Completa',
    all_inclusive: 'All Inclusive',
}

export function HotelComparisonTable({
    items,
    selections,
    onSelectItem,
    cityGroup,
    dateRange,
}: HotelComparisonTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [activeIndex, setActiveIndex] = useState(0)
    const [detailItem, setDetailItem] = useState<ProposalItemWithOptions | null>(null)

    // Normalize hotel data from rich_content
    const hotels = useMemo(() => {
        return items.map(item => {
            const rc = (item.rich_content as Record<string, any>) || {}
            const nights = rc.nights || 1
            const pricePerNight = rc.price_per_night || Number(item.base_price) / nights || 0

            return {
                id: item.id,
                name: item.title || rc.hotel_name || 'Hotel',
                imageUrl: item.image_url || rc.image_url,
                starRating: rc.star_rating || 4,
                roomType: rc.room_type || 'Standard',
                boardType: rc.board_type || 'breakfast',
                boardTypeLabel: BOARD_TYPE_LABELS[rc.board_type as keyof typeof BOARD_TYPE_LABELS] || rc.board_type || 'Café da Manhã',
                amenities: rc.amenities || [],
                cancellationPolicy: rc.cancellation_policy || '',
                pricePerNight,
                totalPrice: Number(item.base_price) || pricePerNight * nights,
                nights,
                currency: rc.currency || 'BRL',
                isRefundable: rc.cancellation_policy?.toLowerCase().includes('reembolsável') ||
                    rc.cancellation_policy?.toLowerCase().includes('grátis') ||
                    rc.cancellation_policy?.toLowerCase().includes('gratuito'),
                isRecommended: item.is_default_selected,
            }
        })
    }, [items])

    // Card width for scroll calculations (mobile)
    const cardWidth = 320

    // Track active card on scroll
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const handleScroll = () => {
            const index = Math.round(el.scrollLeft / cardWidth)
            setActiveIndex(Math.min(index, hotels.length - 1))
        }

        el.addEventListener('scroll', handleScroll, { passive: true })
        return () => el.removeEventListener('scroll', handleScroll)
    }, [hotels.length, cardWidth])

    // If less than 2 hotels, don't show comparison
    if (hotels.length < 2) {
        return null
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header with city/date info */}
            {(cityGroup || dateRange) && (
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                        {cityGroup && (
                            <p className="font-medium text-slate-900">{cityGroup}</p>
                        )}
                        {dateRange && (
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {dateRange}
                            </p>
                        )}
                    </div>
                    <div className="ml-auto text-xs text-slate-500">
                        {hotels.length} opções
                    </div>
                </div>
            )}

            {/* Mobile: Horizontal scroll cards - COMPACT DESIGN */}
            <div className="md:hidden relative">
                {/* Scrollable container - NO ARROWS, just swipe */}
                <div
                    ref={scrollRef}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 px-4 py-3"
                    role="list"
                    aria-label="Comparação de hotéis"
                >
                    {hotels.map((hotel) => {
                        const isSelected = selections[hotel.id]?.selected ?? false
                        return (
                            <div
                                key={hotel.id}
                                className={cn(
                                    'flex-shrink-0 w-[calc(100vw-48px)] max-w-[320px] snap-center rounded-2xl overflow-hidden shadow-lg transition-all duration-200',
                                    isSelected
                                        ? 'ring-2 ring-blue-500 bg-white'
                                        : 'bg-white border border-slate-200'
                                )}
                                role="listitem"
                                aria-selected={isSelected}
                            >
                                {/* COMPACT Image with overlays (100px height) */}
                                <div className="relative h-28 w-full overflow-hidden">
                                    {hotel.imageUrl ? (
                                        <img
                                            src={hotel.imageUrl}
                                            alt={hotel.name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                            <Building2 className="h-10 w-10 text-slate-300" />
                                        </div>
                                    )}

                                    {/* Recommended badge - top left */}
                                    {hotel.isRecommended && (
                                        <div className="absolute top-2 left-2">
                                            <span className="px-2 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow">
                                                ✓ Recomendado
                                            </span>
                                        </div>
                                    )}

                                    {/* Selection indicator - top right */}
                                    <div className={cn(
                                        'absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow transition-all',
                                        isSelected
                                            ? 'bg-blue-600'
                                            : 'bg-white/80 border-2 border-slate-300'
                                    )}>
                                        {isSelected && <Check className="h-4 w-4 text-white" />}
                                    </div>

                                    {/* Price overlay - bottom right */}
                                    <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur px-2 py-1 rounded-lg shadow">
                                        <span className={cn(
                                            'text-lg font-bold',
                                            isSelected ? 'text-emerald-600' : 'text-slate-900'
                                        )}>
                                            {formatPrice(hotel.totalPrice, hotel.currency)}
                                        </span>
                                    </div>
                                </div>

                                {/* COMPACT Content */}
                                <div className="p-3">
                                    {/* Name + Stars */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-slate-900 line-clamp-1">
                                                {hotel.name}
                                            </h3>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <div className="flex items-center gap-0.5">
                                                    {Array.from({ length: hotel.starRating }).map((_, i) => (
                                                        <Star key={i} className="h-3 w-3 text-amber-400 fill-amber-400" />
                                                    ))}
                                                </div>
                                                <span className="text-xs text-slate-500">•</span>
                                                <span className="text-xs text-slate-500 truncate">{hotel.roomType}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Amenities - max 3 chips */}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {hotel.amenities.slice(0, 3).map((amenity: string, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Board + Cancellation - single line */}
                                    <div className="flex justify-between items-center mt-2 text-xs">
                                        <span className="text-slate-600 flex items-center gap-1">
                                            <Utensils className="h-3 w-3" />
                                            {hotel.boardTypeLabel}
                                        </span>
                                        <span className={cn(
                                            'font-medium',
                                            hotel.isRefundable ? 'text-emerald-600' : 'text-amber-600'
                                        )}>
                                            {hotel.isRefundable ? '✓ Cancel. grátis' : '⚠️ Não reembolsável'}
                                        </span>
                                    </div>

                                    {/* Ver mais button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            const originalItem = items.find(i => i.id === hotel.id)
                                            if (originalItem) setDetailItem(originalItem)
                                        }}
                                        className="mt-2 w-full text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1 py-1"
                                    >
                                        <Info className="h-3 w-3" />
                                        Ver detalhes completos
                                    </button>
                                </div>

                                {/* COMPACT Footer with CTA - ALWAYS VISIBLE */}
                                <div className="px-3 pb-3 flex justify-between items-center gap-3">
                                    <div className="text-xs text-slate-500">
                                        {formatPrice(hotel.pricePerNight, hotel.currency)}/noite × {hotel.nights}
                                    </div>
                                    <button
                                        onClick={() => onSelectItem(hotel.id)}
                                        className={cn(
                                            'px-4 py-2.5 rounded-xl font-semibold text-sm transition-all min-h-[44px]',
                                            isSelected
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-100 text-slate-700 hover:bg-blue-50'
                                        )}
                                        aria-pressed={isSelected}
                                    >
                                        {isSelected ? '✓ Selecionado' : 'Selecionar'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Dots indicator */}
                <div className="flex justify-center gap-1.5 pb-3">
                    {hotels.map((hotel, index) => (
                        <div
                            key={hotel.id}
                            className={cn(
                                'h-2 rounded-full transition-all duration-200',
                                index === activeIndex
                                    ? 'bg-blue-600 w-4'
                                    : selections[hotel.id]?.selected
                                        ? 'bg-blue-400 w-2'
                                        : 'bg-slate-300 w-2'
                            )}
                        />
                    ))}
                </div>
            </div>

            {/* Desktop: Full table grid */}
            <div className="hidden md:block overflow-x-auto">
                <table
                    className="w-full min-w-[600px]"
                    role="table"
                    aria-label="Comparação de hotéis"
                >
                    <thead className="sr-only">
                        <tr>
                            <th scope="col">Critério</th>
                            {hotels.map(hotel => (
                                <th key={hotel.id} scope="col">{hotel.name}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Image row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0"></th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('transition-all duration-200', isSelected && 'bg-blue-50/50')}>
                                        <div className="relative aspect-[4/3] m-2 rounded-lg overflow-hidden">
                                            {hotel.imageUrl ? (
                                                <img src={hotel.imageUrl} alt={hotel.name} className="w-full h-full object-cover" loading="lazy" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                                    <Building2 className="h-8 w-8 text-slate-300" />
                                                </div>
                                            )}
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                                                    <Check className="h-4 w-4 text-white" />
                                                </div>
                                            )}
                                            {hotel.isRecommended && (
                                                <div className="absolute top-2 left-2">
                                                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                                                        Recomendado
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Name row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">Hotel</th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-2', isSelected && 'bg-blue-50/50')}>
                                        <p className="font-semibold text-slate-900">{hotel.name}</p>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Stars row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">Classificação</th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-2', isSelected && 'bg-blue-50/50')}>
                                        <div className="flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star key={i} className={cn('h-4 w-4', i < hotel.starRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />
                                            ))}
                                        </div>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Room row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">Quarto</th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-2', isSelected && 'bg-blue-50/50')}>
                                        <span className="text-sm text-slate-700">{hotel.roomType}</span>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Board row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">Regime</th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-2', isSelected && 'bg-blue-50/50')}>
                                        <span className={cn(
                                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                                            hotel.boardType === 'all_inclusive' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                        )}>
                                            <Utensils className="h-3 w-3" />
                                            {hotel.boardTypeLabel}
                                        </span>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Price row */}
                        <tr className="border-b border-slate-100">
                            <th scope="row" className="w-32 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">Preço</th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-3', isSelected && 'bg-blue-50/50')}>
                                        <p className={cn('text-lg font-bold', isSelected ? 'text-emerald-600' : 'text-slate-900')}>
                                            {formatPrice(hotel.totalPrice, hotel.currency)}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {formatPrice(hotel.pricePerNight, hotel.currency)}/noite
                                        </p>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Select row */}
                        <tr>
                            <th scope="row" className="w-32 px-4 py-2 bg-slate-50 sticky left-0"></th>
                            {hotels.map(hotel => {
                                const isSelected = selections[hotel.id]?.selected ?? false
                                return (
                                    <td key={hotel.id} className={cn('px-3 py-3', isSelected && 'bg-blue-50/50')}>
                                        <button
                                            onClick={() => onSelectItem(hotel.id)}
                                            className={cn(
                                                'w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200',
                                                isSelected
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-blue-300'
                                            )}
                                        >
                                            {isSelected ? 'Selecionado' : 'Selecionar'}
                                        </button>
                                    </td>
                                )
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Item Detail Modal */}
            <ItemDetailModal
                item={detailItem}
                isOpen={!!detailItem}
                onClose={() => setDetailItem(null)}
                isSelected={detailItem ? (selections[detailItem.id]?.selected ?? false) : false}
                onSelect={() => {
                    if (detailItem) onSelectItem(detailItem.id)
                }}
            />
        </div>
    )
}

export default HotelComparisonTable
