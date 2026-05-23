/**
 * MobileTransferCard - Card de transfer otimizado para mobile
 *
 * Lê rich_content.transfer diretamente via reader
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import { Car, ArrowDown, Clock, Users, Plane, Building2, Ship, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readTransferData } from '../../shared/readers'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateShort, formatTime } from '../../shared/utils/dateUtils'

interface MobileTransferCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onToggle: () => void
  onSelectOption: (optionId: string) => void
}

// Ícones por tipo de local
const LocationIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'airport':
      return <Plane className="h-4 w-4" />
    case 'hotel':
      return <Building2 className="h-4 w-4" />
    case 'port':
      return <Ship className="h-4 w-4" />
    default:
      return <MapPin className="h-4 w-4" />
  }
}

export function MobileTransferCard({
  item,
  isSelected,
  selectedOptionId,
  onToggle,
  onSelectOption,
}: MobileTransferCardProps) {
  const transferData = readTransferData(item)

  if (!transferData) {
    return (
      <div className="p-4 bg-teal-50 rounded-xl text-center">
        <Car className="h-8 w-8 text-teal-300 mx-auto mb-2" />
        <p className="text-sm text-teal-500">Dados do transfer não disponíveis</p>
      </div>
    )
  }

  // Preço com opção
  const selectedOption = transferData.options.find(o => o.id === selectedOptionId)
  const totalPrice = selectedOption?.price ?? transferData.price

  return (
    <div
      className={cn(
        "transition-all duration-200 overflow-hidden",
        isSelected ? "bg-teal-50/50" : "bg-white hover:bg-slate-50"
      )}
    >
      <button onClick={onToggle} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          {/* Ícone + Toggle visual */}
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isSelected ? "bg-teal-100" : "bg-slate-100"
            )}>
              <Car className={cn("h-5 w-5", isSelected ? "text-teal-600" : "text-slate-400")} />
            </div>
            {/* Toggle */}
            <div className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              isSelected ? "bg-teal-600" : "bg-slate-200"
            )}>
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                isSelected ? "translate-x-5" : "translate-x-1"
              )} />
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            {/* Rota — vertical em mobile pra não brigar com o preço.
                Cada linha tem icon (16) + texto truncado, cabe em ~180px. */}
            {transferData.showRoute && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm text-slate-700 min-w-0">
                  <LocationIcon type={transferData.originType} />
                  <span className="font-medium truncate">{transferData.origin}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-700 min-w-0">
                  <ArrowDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <LocationIcon type={transferData.destinationType} />
                  <span className="font-medium truncate">{transferData.destination}</span>
                </div>
              </div>
            )}

            {/* Data/hora e veículo */}
            <div className="mt-2 flex flex-wrap gap-2">
              {transferData.showDatetime && transferData.date && (
                <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateShort(transferData.date)} {formatTime(transferData.time)}
                </span>
              )}
              {transferData.showVehicle && transferData.vehicleType && (
                <span className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded">
                  {transferData.vehicleType}
                </span>
              )}
              {transferData.showPassengers && transferData.passengers > 1 && (
                <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {transferData.passengers}
                </span>
              )}
            </div>

            {/* Descrição */}
            {transferData.description && (
              <p className="mt-2 text-xs text-slate-500 line-clamp-2">{transferData.description}</p>
            )}
          </div>

          {/* Preço */}
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold text-slate-900">
              {formatPrice(totalPrice)}
            </p>
          </div>
        </div>
      </button>

      {/* Variantes de veículo — Padrão + alternativas. Opção SUBSTITUI o preço. */}
      {transferData.options.length > 0 && isSelected && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Tipo de veículo
          </p>
          <div className="space-y-2">
            {/* Padrão */}
            <button
              onClick={() => onSelectOption('')}
              className={cn(
                'w-full text-left p-3 rounded-xl border-2 transition-all',
                !selectedOptionId
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-slate-200 hover:border-slate-300 bg-white',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    !selectedOptionId ? 'border-teal-600' : 'border-slate-300',
                  )}>
                    {!selectedOptionId && <div className="w-2 h-2 rounded-full bg-teal-600" />}
                  </div>
                  <span className="text-sm font-medium text-slate-900">
                    {transferData.vehicleType || 'Padrão'}
                  </span>
                </div>
                <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                  {formatPrice(transferData.price)}
                </span>
              </div>
            </button>

            {transferData.options.map(option => {
              const isOptionSelected = selectedOptionId === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => onSelectOption(option.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border-2 transition-all',
                    isOptionSelected
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-slate-200 hover:border-teal-300 bg-white',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        isOptionSelected ? 'border-teal-600' : 'border-slate-300',
                      )}>
                        {isOptionSelected && <div className="w-2 h-2 rounded-full bg-teal-600" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {option.label}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                      {formatPrice(option.price)}
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
