/**
 * MobileExperienceCard - Card de experiência otimizado para mobile
 *
 * Lê rich_content.experience diretamente via reader
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Sparkles, Check, Clock, MapPin, Users, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readExperienceData, DIFFICULTY_LABELS } from '../../shared/readers'
import { formatPrice, formatPriceDelta } from '../../shared/utils/priceUtils'
import { formatDateShort, formatTime } from '../../shared/utils/dateUtils'

interface MobileExperienceCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onToggle: () => void
  onSelectOption: (optionId: string) => void
}

export function MobileExperienceCard({
  item,
  isSelected,
  selectedOptionId,
  onToggle,
  onSelectOption,
}: MobileExperienceCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const expData = readExperienceData(item)

  if (!expData) {
    return (
      <div className="p-4 bg-purple-50 rounded-xl text-center">
        <Sparkles className="h-8 w-8 text-purple-300 mx-auto mb-2" />
        <p className="text-sm text-purple-500">Dados da experiência não disponíveis</p>
      </div>
    )
  }

  // Imagem
  const images = expData.images.length > 0 ? expData.images : expData.imageUrl ? [expData.imageUrl] : []
  const hasImage = images.length > 0

  // Preço com opção
  const selectedOption = expData.options.find(o => o.id === selectedOptionId)
  const optionPrice = selectedOption?.price ?? 0
  const totalPrice = expData.totalPrice + optionPrice

  return (
    <div
      className={cn(
        "transition-all duration-200 overflow-hidden",
        isSelected ? "bg-purple-50/50" : "bg-white hover:bg-slate-50"
      )}
    >
      {/* Área clicável */}
      <button onClick={onToggle} className="w-full text-left">
        {/* Imagem */}
        {hasImage && (
          <div className="relative w-full aspect-[3/2] overflow-hidden">
            <img
              src={images[0]}
              alt={expData.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {item.is_default_selected && (
              <span className="absolute top-3 left-3 px-3 py-1 bg-purple-500 text-white text-xs font-semibold rounded-full shadow-lg">
                ✓ Recomendado
              </span>
            )}
            <div className={cn(
              "absolute top-3 right-3 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all",
              isSelected
                ? "border-purple-600 bg-purple-600"
                : "border-white bg-white/80 backdrop-blur-sm"
            )}>
              {isSelected && <Check className="h-4 w-4 text-white" />}
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Ícone se sem imagem */}
            {!hasImage && (
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                isSelected ? "bg-purple-100" : "bg-slate-100"
              )}>
                <Sparkles className={cn("h-6 w-6", isSelected ? "text-purple-600" : "text-slate-400")} />
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className={cn(
                    "font-semibold text-lg leading-tight",
                    isSelected ? "text-slate-900" : "text-slate-700"
                  )}>
                    {expData.name}
                  </h3>

                  {expData.locationCity && (
                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {expData.locationCity}
                    </p>
                  )}
                </div>

                {/* Preço */}
                <div className="text-right flex-shrink-0">
                  <p className={cn(
                    "text-xl font-bold",
                    isSelected ? "text-purple-600" : "text-slate-600"
                  )}>
                    {isSelected ? `+${formatPrice(totalPrice)}` : formatPrice(totalPrice)}
                  </p>
                  {expData.priceType === 'per_person' && (
                    <p className="text-xs text-slate-500">por pessoa</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Toggle visual */}
          {!hasImage && (
            <div className="mt-3 flex justify-end">
              <div className={cn(
                "w-12 h-7 rounded-full transition-colors relative",
                isSelected ? "bg-purple-600" : "bg-slate-200"
              )}>
                <div className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                  isSelected ? "translate-x-6" : "translate-x-1"
                )} />
              </div>
            </div>
          )}

          {/* Chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {expData.date && (
              <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded">
                {formatDateShort(expData.date)}
              </span>
            )}
            {expData.time && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(expData.time)}
              </span>
            )}
            {expData.duration && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                {expData.duration}
              </span>
            )}
            {expData.participants > 1 && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
                <Users className="h-3 w-3" />
                {expData.participants} pessoas
              </span>
            )}
            {expData.difficultyLevel && (
              <span className={cn(
                "px-2 py-1 text-xs rounded",
                expData.difficultyLevel === 'easy' && "bg-green-50 text-green-700",
                expData.difficultyLevel === 'moderate' && "bg-amber-50 text-amber-700",
                expData.difficultyLevel === 'challenging' && "bg-red-50 text-red-700",
              )}>
                {DIFFICULTY_LABELS[expData.difficultyLevel]}
              </span>
            )}
          </div>

          {/* Incluído */}
          {expData.included.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {expData.included.slice(0, 3).map((inc, i) => (
                <span key={i} className="text-xs text-emerald-600">
                  ✓ {inc}
                </span>
              ))}
              {expData.included.length > 3 && (
                <span className="text-xs text-slate-500">+{expData.included.length - 3}</span>
              )}
            </div>
          )}

          {/* Ver detalhes */}
          {(expData.description || expData.meetingPoint) && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDetails(!showDetails)
              }}
              className="mt-3 w-full text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center justify-center gap-1 py-1.5 bg-purple-50/50 rounded-lg"
            >
              <Info className="h-3 w-3" />
              {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
          )}
        </div>
      </button>

      {/* Detalhes */}
      {showDetails && (
        <div className="px-4 pb-4 border-t border-slate-100 space-y-2">
          {expData.description && (
            <p className="text-sm text-slate-600 pt-3">{expData.description}</p>
          )}
          {expData.meetingPoint && (
            <p className="text-xs text-slate-500">
              <strong>Ponto de encontro:</strong> {expData.meetingPoint}
            </p>
          )}
          {expData.cancellationPolicy && (
            <p className="text-xs text-slate-500">
              <strong>Cancelamento:</strong> {expData.cancellationPolicy}
            </p>
          )}
        </div>
      )}

      {/* Opções */}
      {expData.options.length > 0 && isSelected && (
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Extras disponíveis
          </p>
          <div className="space-y-2">
            {expData.options.map(option => {
              const isOptionSelected = selectedOptionId === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => onSelectOption(option.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border-2 transition-all",
                    isOptionSelected
                      ? "border-purple-500 bg-purple-50"
                      : "border-slate-200 hover:border-purple-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        isOptionSelected ? "border-purple-600 bg-purple-600" : "border-slate-300"
                      )}>
                        {isOptionSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{option.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-amber-600">
                      {formatPriceDelta(option.price)}
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
