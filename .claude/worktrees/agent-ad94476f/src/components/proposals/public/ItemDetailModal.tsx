/**
 * ItemDetailModal - Modal de detalhes completos para items de proposta
 *
 * Features:
 * - Bottom sheet em mobile, modal centralizado em desktop
 * - Mostra TODAS as informações do item
 * - Galeria de imagens (se houver múltiplas)
 * - Botão de seleção sticky no footer
 * - Animações suaves
 */

import { useEffect } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import {
    X,
    Check,
    MapPin,
    Calendar,
    Clock,
    Users,
    Utensils,
    Star,
    Info,
    BedDouble,
    Plane,
    Ship,
    Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice, formatDate, calculateNights } from './utils'
import { MobileImageGallery } from './MobileImageGallery'

interface ItemDetailModalProps {
    item: ProposalItemWithOptions | null
    isOpen: boolean
    onClose: () => void
    isSelected: boolean
    onSelect: () => void
}

export function ItemDetailModal({
    item,
    isOpen,
    onClose,
    isSelected,
    onSelect,
}: ItemDetailModalProps) {
    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
        }
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    if (!isOpen || !item) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const richContent = (item.rich_content as Record<string, any>) || {}

    // Build gallery images array
    const galleryImages: string[] = (() => {
        const rc = richContent
        if (Array.isArray(rc.gallery_urls) && rc.gallery_urls.length > 0) {
            return rc.gallery_urls as string[]
        }
        if (Array.isArray(rc.images) && rc.images.length > 0) {
            return rc.images as string[]
        }
        if (item.image_url) {
            return [item.image_url]
        }
        return []
    })()

    // Get item type icon
    const getTypeIcon = () => {
        switch (item.item_type) {
            case 'hotel': return <BedDouble className="h-5 w-5" />
            case 'flight': return <Plane className="h-5 w-5" />
            case 'service': return <Ship className="h-5 w-5" />
            case 'insurance': return <Shield className="h-5 w-5" />
            default: return <Info className="h-5 w-5" />
        }
    }

    // Calculate price info
    const basePrice = Number(item.base_price) || 0
    const nights = calculateNights(richContent.check_in_date, richContent.check_out_date)
    const pricePerNight = richContent.price_per_night
        ? Number(richContent.price_per_night)
        : basePrice / nights

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal - Bottom sheet on mobile, centered on desktop */}
            <div className={cn(
                "relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden",
                "animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300"
            )}>
                {/* Close button - fixed position */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg flex items-center justify-center hover:bg-white transition-colors"
                    aria-label="Fechar"
                >
                    <X className="h-5 w-5 text-slate-600" />
                </button>

                {/* Image Header */}
                {galleryImages.length > 0 ? (
                    <div className="relative">
                        {galleryImages.length > 1 ? (
                            <MobileImageGallery
                                images={galleryImages}
                                altText={item.title}
                                aspectRatio="16/9"
                            />
                        ) : (
                            <div className="relative aspect-[16/9] w-full overflow-hidden">
                                <img
                                    src={galleryImages[0]}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                        {/* Badges on image */}
                        <div className="absolute top-4 left-4 flex flex-col gap-2">
                            {item.is_default_selected && (
                                <span className="px-3 py-1.5 bg-emerald-500 text-white text-sm font-semibold rounded-full shadow-lg">
                                    Recomendado
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/80 flex items-center justify-center text-slate-400">
                            {getTypeIcon()}
                        </div>
                    </div>
                )}

                {/* Scrollable Content */}
                <div className="overflow-y-auto max-h-[50vh] p-4 space-y-4">
                    {/* Title & Basic Info */}
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>

                        {/* Location */}
                        {(richContent.subtitle || richContent.location_city) && (
                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" />
                                {richContent.subtitle || richContent.location_city}
                            </p>
                        )}

                        {/* Star Rating for hotels */}
                        {richContent.star_rating && (
                            <div className="flex items-center gap-0.5 mt-2">
                                {Array.from({ length: Number(richContent.star_rating) }).map((_, i) => (
                                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    {item.description && (
                        <p className="text-sm text-slate-600 leading-relaxed">
                            {item.description}
                        </p>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Room Type */}
                        {richContent.room_type && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <BedDouble className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Quarto</p>
                                    <p className="font-medium text-slate-700">{richContent.room_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Board Type */}
                        {richContent.board_type && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <Utensils className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Regime</p>
                                    <p className="font-medium text-slate-700">{richContent.board_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Check-in Date */}
                        {richContent.check_in_date && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Check-in</p>
                                    <p className="font-medium text-slate-700">
                                        {formatDate(richContent.check_in_date, 'long')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Check-out Date */}
                        {richContent.check_out_date && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Check-out</p>
                                    <p className="font-medium text-slate-700">
                                        {formatDate(richContent.check_out_date, 'long')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Duration */}
                        {richContent.duration && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                    <Clock className="h-5 w-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Duração</p>
                                    <p className="font-medium text-slate-700">{richContent.duration}</p>
                                </div>
                            </div>
                        )}

                        {/* Guests */}
                        {richContent.guests && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center">
                                    <Users className="h-5 w-5 text-pink-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Hóspedes</p>
                                    <p className="font-medium text-slate-700">{richContent.guests}</p>
                                </div>
                            </div>
                        )}

                        {/* Cabin Class */}
                        {richContent.cabin_class && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                                    <Plane className="h-5 w-5 text-sky-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Classe</p>
                                    <p className="font-medium text-slate-700">{richContent.cabin_class}</p>
                                </div>
                            </div>
                        )}

                        {/* Itinerary */}
                        {richContent.itinerary && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl col-span-2">
                                <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                                    <Ship className="h-5 w-5 text-cyan-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Roteiro</p>
                                    <p className="font-medium text-slate-700">{richContent.itinerary}</p>
                                </div>
                            </div>
                        )}

                        {/* Meeting Point */}
                        {richContent.meeting_point && (
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl col-span-2">
                                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                    <MapPin className="h-5 w-5 text-red-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Ponto de encontro</p>
                                    <p className="font-medium text-slate-700">{richContent.meeting_point}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Amenities */}
                    {richContent.amenities && Array.isArray(richContent.amenities) && richContent.amenities.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-2">Comodidades</h3>
                            <div className="flex flex-wrap gap-2">
                                {richContent.amenities.map((amenity: string, i: number) => (
                                    <span key={i} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm rounded-full">
                                        {amenity}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Included */}
                    {richContent.included && Array.isArray(richContent.included) && richContent.included.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-2">Incluso</h3>
                            <div className="space-y-2">
                                {richContent.included.map((includedItem: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                                        <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                        {includedItem}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cancellation Policy */}
                    {richContent.cancellation_policy && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                            <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-amber-800">Política de cancelamento</p>
                                    <p className="text-sm text-amber-700 mt-0.5">{richContent.cancellation_policy}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {richContent.notes && (
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-slate-600">{richContent.notes}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer with Price & CTA */}
                <div className="border-t border-slate-200 p-4 bg-white flex items-center justify-between gap-4">
                    <div>
                        <p className="text-2xl font-bold text-emerald-600">
                            {formatPrice(basePrice)}
                        </p>
                        {item.item_type === 'hotel' && nights > 1 && (
                            <p className="text-xs text-slate-500">
                                {formatPrice(pricePerNight)}/noite × {nights} noites
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            onSelect()
                            onClose()
                        }}
                        className={cn(
                            "px-6 py-3 rounded-xl font-semibold text-base transition-all min-h-[48px]",
                            isSelected
                                ? "bg-emerald-600 text-white"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                        )}
                    >
                        {isSelected ? (
                            <span className="flex items-center gap-2">
                                <Check className="h-5 w-5" />
                                Selecionado
                            </span>
                        ) : (
                            'Selecionar'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ItemDetailModal
