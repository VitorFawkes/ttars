/**
 * MobileHotelCard - Card de hotel otimizado para mobile
 *
 * Lê rich_content.hotel diretamente via reader
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Building2, Star, Check, Minus, Plus, Info, MapPin, Utensils, BedDouble } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readHotelData } from '../../shared/readers'
import { formatPrice, formatPriceDelta } from '../../shared/utils/priceUtils'
import { formatDateRange } from '../../shared/utils/dateUtils'

interface MobileHotelCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
  quantity?: number
  onChangeQuantity?: (quantity: number) => void
  isRadioMode?: boolean
}

export function MobileHotelCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
  quantity = 1,
  onChangeQuantity,
  isRadioMode = false,
}: MobileHotelCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const hotelData = readHotelData(item)

  if (!hotelData) {
    return (
      <div className="p-4 bg-slate-50 rounded-xl text-center">
        <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Dados do hotel não disponíveis</p>
      </div>
    )
  }

  // Imagens
  const images = hotelData.images.length > 0 ? hotelData.images : hotelData.imageUrl ? [hotelData.imageUrl] : []
  const hasImage = images.length > 0

  // Preço com opção selecionada
  const selectedOption = hotelData.options.find(o => o.id === selectedOptionId)
  const optionDelta = selectedOption?.priceDelta ?? 0
  const unitPrice = hotelData.pricePerNight + optionDelta
  const totalPrice = unitPrice * hotelData.nights * quantity

  return (
    <div
      className={cn(
        "transition-all duration-200 overflow-hidden",
        isSelected ? "bg-emerald-50/50" : "bg-white hover:bg-slate-50"
      )}
    >
      {/* Área clicável principal */}
      <button
        onClick={onSelect}
        className="w-full text-left"
      >
        {/* Imagem Header */}
        {hasImage && (
          <div className="relative w-full aspect-[3/2] overflow-hidden">
            <img
              src={images[0]}
              alt={hotelData.hotelName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Badge recomendado */}
            {item.is_default_selected && (
              <span className="absolute top-3 left-3 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow-lg">
                ✓ Recomendado
              </span>
            )}
            {/* Checkbox de seleção */}
            <div className={cn(
              "absolute top-3 right-3 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all",
              isSelected
                ? "border-emerald-600 bg-emerald-600"
                : "border-white bg-white/80 backdrop-blur-sm"
            )}>
              {isSelected && <Check className="h-4 w-4 text-white" />}
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Ícone se não tem imagem */}
            {!hasImage && (
              <>
                {isRadioMode && (
                  <div className={cn(
                    "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
                  )}>
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                )}
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                  isSelected ? "bg-emerald-100" : "bg-slate-100"
                )}>
                  <Building2 className={cn("h-6 w-6", isSelected ? "text-emerald-600" : "text-slate-400")} />
                </div>
              </>
            )}

            {/* Info principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className={cn(
                    "font-semibold text-lg leading-tight",
                    isSelected ? "text-slate-900" : "text-slate-700"
                  )}>
                    {hotelData.hotelName}
                  </h3>

                  {/* Estrelas */}
                  {hotelData.starRating > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: hotelData.starRating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  )}

                  {/* Localização */}
                  {hotelData.locationCity && (
                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {hotelData.locationCity}
                    </p>
                  )}
                </div>

                {/* Preço */}
                <div className="text-right flex-shrink-0">
                  <p className={cn(
                    "text-xl font-bold",
                    isSelected ? "text-emerald-600" : "text-slate-600"
                  )}>
                    {formatPrice(totalPrice)}
                  </p>
                  {hotelData.nights > 1 && (
                    <p className="text-xs text-slate-500">
                      {hotelData.nights} noites
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Chips de info */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hotelData.roomType && (
              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded flex items-center gap-1">
                <BedDouble className="h-3 w-3" />
                {hotelData.roomType}
              </span>
            )}
            {hotelData.boardType && (
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded flex items-center gap-1">
                <Utensils className="h-3 w-3" />
                {hotelData.boardType}
              </span>
            )}
            {hotelData.checkInDate && hotelData.checkOutDate && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                {formatDateRange(hotelData.checkInDate, hotelData.checkOutDate)}
              </span>
            )}
            {/* Amenities - max 3 */}
            {hotelData.amenities.slice(0, 3).map((amenity, i) => (
              <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                {amenity}
              </span>
            ))}
            {hotelData.amenities.length > 3 && (
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded">
                +{hotelData.amenities.length - 3}
              </span>
            )}
          </div>

          {/* Política de cancelamento */}
          {hotelData.cancellationPolicy && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Info className="h-3.5 w-3.5 text-slate-400" />
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

          {/* Ver detalhes */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDetails(!showDetails)
            }}
            className="mt-3 w-full text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center justify-center gap-1 py-1.5 bg-emerald-50/50 rounded-lg"
          >
            <Info className="h-3 w-3" />
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
        </div>
      </button>

      {/* Detalhes expandidos */}
      {showDetails && hotelData.description && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-sm text-slate-600 pt-3">{hotelData.description}</p>
        </div>
      )}

      {/* Controle de quantidade */}
      {isSelected && onChangeQuantity && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg w-fit">
            <span className="text-sm text-slate-600">Quartos:</span>
            <button
              onClick={() => onChangeQuantity(Math.max(1, quantity - 1))}
              className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-lg font-semibold text-slate-900">
              {quantity}
            </span>
            <button
              onClick={() => onChangeQuantity(quantity + 1)}
              className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Opções de upgrade */}
      {hotelData.options.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Opções de quarto
          </p>
          <div className="space-y-2">
            {hotelData.options.map(option => {
              const isOptionSelected = selectedOptionId === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => onSelectOption(option.id)}
                  disabled={!isSelected}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border-2 transition-all",
                    isOptionSelected
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 hover:border-emerald-300",
                    !isSelected && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        isOptionSelected
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-slate-300"
                      )}>
                        {isOptionSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">
                        {option.label}
                      </span>
                      {option.isRecommended && (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded">
                          Recomendado
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-sm font-semibold",
                      option.priceDelta > 0 ? "text-amber-600" : option.priceDelta < 0 ? "text-emerald-600" : "text-slate-500"
                    )}>
                      {formatPriceDelta(option.priceDelta)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
