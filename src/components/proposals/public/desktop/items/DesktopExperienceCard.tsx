/**
 * DesktopExperienceCard - Card de experiência otimizado para desktop
 *
 * Layout com imagem lateral, detalhes completos e informações de reserva
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Compass, Check, Clock, MapPin, Users, Calendar, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readExperienceData } from '../../shared/readers'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateShort, formatTime } from '../../shared/utils/dateUtils'

interface DesktopExperienceCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
}

export function DesktopExperienceCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
}: DesktopExperienceCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const experienceData = readExperienceData(item)

  if (!experienceData) {
    return (
      <div className="p-8 bg-amber-50 rounded-2xl text-center border-2 border-dashed border-amber-200">
        <Compass className="h-12 w-12 text-amber-300 mx-auto mb-3" />
        <p className="text-amber-700 font-medium">Dados da experiência não disponíveis</p>
      </div>
    )
  }

  // Imagens
  const images = experienceData.images.length > 0 ? experienceData.images : experienceData.imageUrl ? [experienceData.imageUrl] : []
  const hasImages = images.length > 0

  // Preço com opção selecionada
  const selectedOption = experienceData.options.find(o => o.id === selectedOptionId)
  const basePrice = selectedOption?.price ?? experienceData.price
  const totalPrice = experienceData.priceType === 'per_person'
    ? basePrice * experienceData.participants
    : basePrice

  const nextImage = () => setCurrentImageIndex((prev) => (prev + 1) % images.length)
  const prevImage = () => setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)

  // Nível de dificuldade
  const difficultyLabels: Record<string, { label: string; color: string }> = {
    easy: { label: 'Fácil', color: 'text-green-600 bg-green-50' },
    moderate: { label: 'Moderado', color: 'text-amber-600 bg-amber-50' },
    challenging: { label: 'Desafiador', color: 'text-red-600 bg-red-50' },
  }

  const difficulty = experienceData.difficultyLevel
    ? difficultyLabels[experienceData.difficultyLevel]
    : null

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border-2",
        isSelected
          ? "border-amber-500 bg-amber-50/30 shadow-lg shadow-amber-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      )}
    >
      <div className="flex">
        {/* Imagem - Lado esquerdo */}
        {hasImages && (
          <div className="relative w-72 flex-shrink-0">
            <div className="aspect-[4/3] relative overflow-hidden">
              <img
                src={images[currentImageIndex]}
                alt={experienceData.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Navegação de imagens */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage() }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage() }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all",
                          i === currentImageIndex ? "bg-white w-4" : "bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Badge recomendado */}
              {item.is_default_selected && (
                <span className="absolute top-3 left-3 px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-full shadow-lg">
                  ✓ Recomendado
                </span>
              )}
            </div>
          </div>
        )}

        {/* Conteúdo principal */}
        <div className="flex-1 p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                {!hasImages && (
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isSelected ? "bg-amber-100" : "bg-slate-100"
                  )}>
                    <Compass className={cn("h-5 w-5", isSelected ? "text-amber-600" : "text-slate-400")} />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {experienceData.name}
                  </h3>
                  {experienceData.provider && (
                    <p className="text-sm text-slate-500">
                      por {experienceData.provider}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preço + Seleção */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={cn(
                  "text-2xl font-bold",
                  isSelected ? "text-amber-600" : "text-slate-700"
                )}>
                  {formatPrice(totalPrice)}
                </p>
                {experienceData.priceType === 'per_person' && experienceData.participants > 1 && (
                  <p className="text-sm text-slate-500">
                    {formatPrice(basePrice)}/pessoa
                  </p>
                )}
              </div>

              <button
                onClick={onSelect}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "border-amber-600 bg-amber-600"
                    : "border-slate-300 hover:border-amber-400 bg-white"
                )}
              >
                {isSelected && <Check className="h-5 w-5 text-white" />}
              </button>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {experienceData.date && (
              <div className="p-3 bg-amber-50 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 text-xs font-medium mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Data
                </div>
                <p className="text-sm font-semibold text-slate-800">{formatDateShort(experienceData.date)}</p>
              </div>
            )}
            {experienceData.time && (
              <div className="p-3 bg-slate-100 rounded-xl">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Horário
                </div>
                <p className="text-sm font-semibold text-slate-800">{formatTime(experienceData.time)}</p>
              </div>
            )}
            {experienceData.duration && (
              <div className="p-3 bg-slate-100 rounded-xl">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Duração
                </div>
                <p className="text-sm font-semibold text-slate-800">{experienceData.duration}</p>
              </div>
            )}
            {experienceData.participants > 0 && (
              <div className="p-3 bg-slate-100 rounded-xl">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                  <Users className="h-3.5 w-3.5" />
                  Participantes
                </div>
                <p className="text-sm font-semibold text-slate-800">{experienceData.participants}</p>
              </div>
            )}
          </div>

          {/* Localização + Dificuldade */}
          <div className="flex items-center gap-4 mb-4">
            {experienceData.locationCity && (
              <span className="flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {experienceData.locationCity}
              </span>
            )}
            {experienceData.meetingPoint && (
              <span className="text-sm text-slate-500">
                Ponto de encontro: {experienceData.meetingPoint}
              </span>
            )}
            {difficulty && (
              <span className={cn("px-2 py-1 rounded-lg text-xs font-medium", difficulty.color)}>
                {difficulty.label}
              </span>
            )}
          </div>

          {/* O que está incluso */}
          {experienceData.included.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Incluso</p>
              <div className="flex flex-wrap gap-2">
                {experienceData.included.map((item, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-lg"
                  >
                    <Check className="h-3 w-3" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Descrição */}
          {experienceData.description && (
            <p className="text-sm text-slate-600 line-clamp-2 mb-4">
              {experienceData.description}
            </p>
          )}

          {/* Política de cancelamento + Restrição de idade */}
          <div className="flex items-center gap-4 text-sm">
            {experienceData.cancellationPolicy && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Info className="h-4 w-4" />
                {experienceData.cancellationPolicy}
              </span>
            )}
            {experienceData.ageRestriction && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <Info className="h-4 w-4" />
                {experienceData.ageRestriction}
              </span>
            )}
          </div>

          {/* Opções */}
          {experienceData.options.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase mb-2">Opções disponíveis</p>
              <div className="flex gap-2 flex-wrap">
                {experienceData.options.map(option => {
                  const isOptionSelected = selectedOptionId === option.id
                  return (
                    <button
                      key={option.id}
                      onClick={() => onSelectOption(option.id)}
                      disabled={!isSelected}
                      className={cn(
                        "px-3 py-2 rounded-lg border transition-all text-sm",
                        isOptionSelected
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-slate-200 hover:border-amber-300 text-slate-600",
                        !isSelected && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="ml-2 text-xs">
                        {formatPrice(option.price)}
                      </span>
                      {option.isRecommended && (
                        <span className="ml-1 text-[10px] text-amber-600">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
