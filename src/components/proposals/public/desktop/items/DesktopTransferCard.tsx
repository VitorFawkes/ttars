/**
 * DesktopTransferCard - Card de transfer otimizado para desktop
 *
 * Layout com rota visual, detalhes do veículo e informações de horário
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import { Car, Check, Clock, Users, Calendar, ArrowRight, MapPin, Plane, Hotel, Ship } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readTransferData } from '../../shared/readers'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateShort, formatTime } from '../../shared/utils/dateUtils'
import { VEHICLE_TYPE_LABELS } from '../../shared/types'

interface DesktopTransferCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
}

// Ícones por tipo de local
const LOCATION_ICONS: Record<string, typeof Plane> = {
  airport: Plane,
  hotel: Hotel,
  port: Ship,
  address: MapPin,
}

export function DesktopTransferCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
}: DesktopTransferCardProps) {
  const transferData = readTransferData(item)

  if (!transferData) {
    return (
      <div className="p-8 bg-purple-50 rounded-2xl text-center border-2 border-dashed border-purple-200">
        <Car className="h-12 w-12 text-purple-300 mx-auto mb-3" />
        <p className="text-purple-700 font-medium">Dados do transfer não disponíveis</p>
      </div>
    )
  }

  // Preço com opção selecionada
  const selectedOption = transferData.options.find(o => o.id === selectedOptionId)
  const totalPrice = selectedOption?.price ?? transferData.price

  const OriginIcon = LOCATION_ICONS[transferData.originType] || MapPin
  const DestIcon = LOCATION_ICONS[transferData.destinationType] || MapPin

  const vehicleLabel = VEHICLE_TYPE_LABELS[transferData.vehicleType] || transferData.vehicleType

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border-2",
        isSelected
          ? "border-purple-500 bg-purple-50/30 shadow-lg shadow-purple-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      )}
    >
      {/* Header com veículo e preço */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between border-b",
        isSelected ? "bg-purple-50 border-purple-200" : "bg-gradient-to-r from-purple-50 to-indigo-50 border-slate-100"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isSelected ? "bg-purple-100" : "bg-purple-100/70"
          )}>
            <Car className={cn("h-6 w-6", isSelected ? "text-purple-600" : "text-purple-500")} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {item.title || 'Transfer Privativo'}
            </h3>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {transferData.showVehicle && vehicleLabel && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                  {vehicleLabel}
                </span>
              )}
              {transferData.showPassengers && transferData.passengers > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {transferData.passengers} passageiro{transferData.passengers > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={cn(
              "text-2xl font-bold",
              isSelected ? "text-purple-600" : "text-slate-700"
            )}>
              {formatPrice(totalPrice)}
            </p>
          </div>

          <button
            onClick={onSelect}
            className={cn(
              "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
              isSelected
                ? "border-purple-600 bg-purple-600"
                : "border-slate-300 hover:border-purple-400 bg-white"
            )}
          >
            {isSelected && <Check className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>

      {/* Rota visual */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-6">
          {/* Origem */}
          <div className="flex-1">
            <div className={cn(
              "p-4 rounded-xl border-2",
              isSelected ? "bg-purple-50 border-purple-200" : "bg-slate-50 border-slate-200"
            )}>
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-purple-100" : "bg-slate-100"
                )}>
                  <OriginIcon className={cn("h-5 w-5", isSelected ? "text-purple-600" : "text-slate-500")} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Origem</p>
                  <p className="font-semibold text-slate-900">{transferData.origin}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Seta */}
          <div className="flex flex-col items-center gap-2">
            <ArrowRight className={cn(
              "h-6 w-6",
              isSelected ? "text-purple-500" : "text-slate-400"
            )} />
            {transferData.showDatetime && transferData.date && (
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatDateShort(transferData.date)}
              </span>
            )}
          </div>

          {/* Destino */}
          <div className="flex-1">
            <div className={cn(
              "p-4 rounded-xl border-2",
              isSelected ? "bg-purple-50 border-purple-200" : "bg-slate-50 border-slate-200"
            )}>
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-purple-100" : "bg-slate-100"
                )}>
                  <DestIcon className={cn("h-5 w-5", isSelected ? "text-purple-600" : "text-slate-500")} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-medium">Destino</p>
                  <p className="font-semibold text-slate-900">{transferData.destination}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data e horário */}
        {transferData.showDatetime && (transferData.date || transferData.time) && (
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
            {transferData.date && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="h-4 w-4 text-slate-400" />
                {formatDateShort(transferData.date)}
              </div>
            )}
            {transferData.time && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock className="h-4 w-4 text-slate-400" />
                {formatTime(transferData.time)}
              </div>
            )}
          </div>
        )}

        {/* Descrição */}
        {transferData.description && (
          <p className="text-sm text-slate-600 mt-4 text-center">
            {transferData.description}
          </p>
        )}

        {/* Opções de veículo */}
        {transferData.options.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase mb-3 text-center">
              Opções de veículo
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              {transferData.options.map(option => {
                const isOptionSelected = selectedOptionId === option.id
                const optionVehicle = VEHICLE_TYPE_LABELS[option.vehicle] || option.vehicle
                return (
                  <button
                    key={option.id}
                    onClick={() => onSelectOption(option.id)}
                    disabled={!isSelected}
                    className={cn(
                      "px-4 py-3 rounded-xl border-2 transition-all min-w-[120px]",
                      isOptionSelected
                        ? "border-purple-500 bg-purple-50"
                        : "border-slate-200 hover:border-purple-300",
                      !isSelected && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Car className={cn(
                      "h-5 w-5 mx-auto mb-1",
                      isOptionSelected ? "text-purple-600" : "text-slate-400"
                    )} />
                    <p className={cn(
                      "text-sm font-medium",
                      isOptionSelected ? "text-purple-700" : "text-slate-700"
                    )}>
                      {optionVehicle}
                    </p>
                    <p className={cn(
                      "text-xs",
                      isOptionSelected ? "text-purple-600" : "text-slate-500"
                    )}>
                      {formatPrice(option.price)}
                    </p>
                    {option.isRecommended && (
                      <span className="text-[10px] text-purple-600 font-medium">Recomendado</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
