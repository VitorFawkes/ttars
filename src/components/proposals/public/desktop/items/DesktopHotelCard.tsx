/**
 * DesktopHotelCard - Card de hotel otimizado para desktop
 *
 * Layout expandido com mais detalhes visíveis, galeria de imagens,
 * e melhor uso do espaço horizontal
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Building2, Star, Check, Minus, Plus, ChevronLeft, ChevronRight, MapPin, Utensils, BedDouble, Clock, Info, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readHotelData } from '../../shared/readers'
import { formatPrice, formatPriceDelta } from '../../shared/utils/priceUtils'
import { formatDateRange } from '../../shared/utils/dateUtils'
import { BOARD_TYPE_LABELS } from '../../shared/types'

interface DesktopHotelCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
  quantity?: number
  onChangeQuantity?: (quantity: number) => void
  isRadioMode?: boolean
}

export function DesktopHotelCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
  quantity = 1,
  onChangeQuantity,
}: DesktopHotelCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [showAllAmenities, setShowAllAmenities] = useState(false)

  const hotelData = readHotelData(item)

  if (!hotelData) {
    return (
      <div className="p-8 bg-slate-50 rounded-2xl text-center border-2 border-dashed border-slate-200">
        <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Dados do hotel não disponíveis</p>
      </div>
    )
  }

  // Imagens
  const images = hotelData.images.length > 0 ? hotelData.images : hotelData.imageUrl ? [hotelData.imageUrl] : []
  const hasImages = images.length > 0

  // Preço com opção selecionada
  const selectedOption = hotelData.options.find(o => o.id === selectedOptionId)
  const optionDelta = selectedOption?.priceDelta ?? 0
  const unitPrice = hotelData.pricePerNight + optionDelta
  const totalPrice = unitPrice * hotelData.nights * quantity

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  const boardTypeLabel = BOARD_TYPE_LABELS[hotelData.boardType] || hotelData.boardType

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border-2",
        isSelected
          ? "border-emerald-500 bg-emerald-50/30 shadow-lg shadow-emerald-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      )}
    >
      <div className="flex">
        {/* Imagem - Lado esquerdo */}
        {hasImages && (
          <div className="relative w-80 flex-shrink-0">
            <div className="aspect-[4/3] relative overflow-hidden">
              <img
                src={images[currentImageIndex]}
                alt={hotelData.hotelName}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Navegação de imagens */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage() }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage() }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>

                  {/* Indicadores */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(i) }}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all",
                          i === currentImageIndex ? "bg-white w-4" : "bg-white/50 hover:bg-white/75"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Badge recomendado */}
              {item.is_default_selected && (
                <span className="absolute top-3 left-3 px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow-lg">
                  ✓ Recomendado
                </span>
              )}
            </div>
          </div>
        )}

        {/* Conteúdo principal */}
        <div className="flex-1 p-5">
          {/* Header com nome e seleção */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                {!hasImages && (
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isSelected ? "bg-emerald-100" : "bg-slate-100"
                  )}>
                    <Building2 className={cn("h-5 w-5", isSelected ? "text-emerald-600" : "text-slate-400")} />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {hotelData.hotelName}
                  </h3>
                  {/* Estrelas + Localização */}
                  <div className="flex items-center gap-3 mt-1">
                    {hotelData.starRating > 0 && (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: hotelData.starRating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    )}
                    {hotelData.locationCity && (
                      <span className="text-sm text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {hotelData.locationCity}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Seleção + Preço */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={cn(
                  "text-2xl font-bold",
                  isSelected ? "text-emerald-600" : "text-slate-700"
                )}>
                  {formatPrice(totalPrice)}
                </p>
                <p className="text-sm text-slate-500">
                  {formatPrice(unitPrice)}/noite
                </p>
              </div>

              <button
                onClick={onSelect}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "border-emerald-600 bg-emerald-600"
                    : "border-slate-300 hover:border-emerald-400 bg-white"
                )}
              >
                {isSelected && <Check className="h-5 w-5 text-white" />}
              </button>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {hotelData.roomType && (
              <div className="p-3 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-2 text-blue-700 text-xs font-medium mb-1">
                  <BedDouble className="h-3.5 w-3.5" />
                  Acomodação
                </div>
                <p className="text-sm font-semibold text-slate-800">{hotelData.roomType}</p>
              </div>
            )}
            {boardTypeLabel && (
              <div className="p-3 bg-emerald-50 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium mb-1">
                  <Utensils className="h-3.5 w-3.5" />
                  Regime
                </div>
                <p className="text-sm font-semibold text-slate-800">{boardTypeLabel}</p>
              </div>
            )}
            {hotelData.checkInDate && hotelData.checkOutDate && (
              <div className="p-3 bg-slate-100 rounded-xl">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Período
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {formatDateRange(hotelData.checkInDate, hotelData.checkOutDate)}
                </p>
              </div>
            )}
            <div className="p-3 bg-slate-100 rounded-xl">
              <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                <Clock className="h-3.5 w-3.5" />
                Check-in/out
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {hotelData.checkInTime} - {hotelData.checkOutTime}
              </p>
            </div>
          </div>

          {/* Amenities */}
          {hotelData.amenities.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Comodidades</p>
              <div className="flex flex-wrap gap-1.5">
                {(showAllAmenities ? hotelData.amenities : hotelData.amenities.slice(0, 6)).map((amenity, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg"
                  >
                    {amenity}
                  </span>
                ))}
                {hotelData.amenities.length > 6 && !showAllAmenities && (
                  <button
                    onClick={() => setShowAllAmenities(true)}
                    className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-lg hover:bg-slate-200"
                  >
                    +{hotelData.amenities.length - 6} mais
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Política de cancelamento */}
          {hotelData.cancellationPolicy && (
            <div className="flex items-center gap-2 text-sm mb-4">
              <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className={cn(
                hotelData.cancellationPolicy.toLowerCase().includes('grátis') ||
                hotelData.cancellationPolicy.toLowerCase().includes('reembolsável')
                  ? "text-emerald-600"
                  : "text-slate-500"
              )}>
                {hotelData.cancellationPolicy}
              </span>
            </div>
          )}

          {/* Descrição */}
          {hotelData.description && (
            <p className="text-sm text-slate-600 line-clamp-2 mb-4">
              {hotelData.description}
            </p>
          )}

          {/* Controles de quantidade + Opções */}
          <div className="flex items-center justify-between gap-4">
            {/* Controle de quantidade */}
            {isSelected && onChangeQuantity && (
              <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg">
                <span className="text-sm text-slate-600 px-2">Quartos:</span>
                <button
                  onClick={() => onChangeQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-semibold text-slate-900">
                  {quantity}
                </span>
                <button
                  onClick={() => onChangeQuantity(quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Opções de upgrade */}
            {hotelData.options.length > 0 && (
              <div className="flex gap-2 flex-wrap justify-end">
                {hotelData.options.map(option => {
                  const isOptionSelected = selectedOptionId === option.id
                  return (
                    <button
                      key={option.id}
                      onClick={() => onSelectOption(option.id)}
                      disabled={!isSelected}
                      className={cn(
                        "px-3 py-2 rounded-lg border transition-all text-sm",
                        isOptionSelected
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 hover:border-emerald-300 text-slate-600",
                        !isSelected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      {option.priceDelta !== 0 && (
                        <span className={cn(
                          "ml-2 text-xs",
                          option.priceDelta > 0 ? "text-amber-600" : "text-emerald-600"
                        )}>
                          {formatPriceDelta(option.priceDelta)}
                        </span>
                      )}
                      {option.isRecommended && (
                        <span className="ml-1 text-[10px] text-emerald-600">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
