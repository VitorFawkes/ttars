/**
 * MobileFlightCard - Card de voo otimizado para mobile
 *
 * Lê rich_content.flights diretamente via reader
 * Layout compacto conforme mockup
 */

import { useState, useMemo, useCallback } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Plane, Check, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readFlightData, calculateLegDuration } from '../../shared/readers'
import type { FlightLegViewData, FlightOptionViewData } from '../../shared/types'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateWithWeekday, formatTime } from '../../shared/utils/dateUtils'

interface MobileFlightCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string  // formato: "legId1:optId1,legId2:optId2"
  onSelect: () => void
  onSelectOption?: (optionId: string) => void
}

// Cores das companhias aéreas
const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
  'LA': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'G3': { bg: 'bg-orange-100', text: 'text-orange-700' },
  'AD': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'AA': { bg: 'bg-red-100', text: 'text-red-700' },
  'UA': { bg: 'bg-sky-100', text: 'text-sky-700' },
  'DL': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'AF': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'TP': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'IB': { bg: 'bg-red-100', text: 'text-red-700' },
  'LH': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

export function MobileFlightCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
}: MobileFlightCardProps) {
  const [showModal, setShowModal] = useState(false)

  const flightData = readFlightData(item)

  // Parse selected options por leg (formato: "legId1:optId1,legId2:optId2")
  const selectedOptionsMap = useMemo(() => {
    const map = new Map<string, string>()
    if (selectedOptionId) {
      selectedOptionId.split(',').forEach(pair => {
        const [legId, optId] = pair.split(':')
        if (legId && optId) map.set(legId, optId)
      })
    }
    return map
  }, [selectedOptionId])

  // Função para obter opção selecionada de um leg (usuário ou recomendada)
  const getSelectedOptionForLeg = useCallback((leg: FlightLegViewData) => {
    const userSelectedId = selectedOptionsMap.get(leg.id)
    if (userSelectedId) {
      return leg.allOptions.find(o => o.id === userSelectedId) || leg.selectedOption
    }
    return leg.selectedOption
  }, [selectedOptionsMap])

  // Handler para seleção de opção de um leg
  const handleSelectLegOption = useCallback((legId: string, optionId: string) => {
    if (!onSelectOption) return

    const newMap = new Map(selectedOptionsMap)
    newMap.set(legId, optionId)

    // Serializa para string
    const pairs = Array.from(newMap.entries()).map(([l, o]) => `${l}:${o}`)
    onSelectOption(pairs.join(','))
  }, [selectedOptionsMap, onSelectOption])

  // Calcula preço total baseado nas opções selecionadas pelo usuário
  const calculatedTotalPrice = useMemo(() => {
    if (!flightData) return 0
    return flightData.legs.reduce((sum, leg) => {
      const opt = getSelectedOptionForLeg(leg)
      return sum + (opt?.price || 0)
    }, 0)
  }, [flightData, getSelectedOptionForLeg])

  // Check if there's no flight data, no legs, or all legs have no options
  const hasValidOptions = flightData?.legs.some(leg => leg.allOptions.length > 0)

  if (!flightData || flightData.legs.length === 0 || !hasValidOptions) {
    return (
      <div className="p-6 bg-sky-50 rounded-xl text-center">
        <Plane className="h-10 w-10 text-sky-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-sky-700">Nenhum voo configurado</p>
        <p className="text-xs text-sky-500 mt-1">Entre em contato com seu consultor</p>
      </div>
    )
  }

  const outboundLeg = flightData.legs.find(l => l.type === 'outbound')
  const returnLeg = flightData.legs.find(l => l.type === 'return')
  const hasReturn = !!returnLeg

  // Usa opção selecionada pelo usuário ou recomendada
  const mainOption = outboundLeg ? getSelectedOptionForLeg(outboundLeg) : null
  const airlineCode = mainOption?.airlineCode || ''
  const airlineColors = AIRLINE_COLORS[airlineCode] || { bg: 'bg-slate-100', text: 'text-slate-700' }

  // Conta total de opções em todos os legs
  const totalOptionsCount = flightData.legs.reduce((sum, leg) => sum + leg.allOptions.length, 0)
  const hasMultipleOptions = totalOptionsCount > flightData.legs.length // Mais opções do que legs

  // Calcula duração usando a opção atual
  const durationLeg = outboundLeg ? { ...outboundLeg, selectedOption: mainOption } : null
  const duration = durationLeg ? calculateLegDuration(durationLeg) : ''
  const stops = mainOption?.stops ?? 0

  // Verifica se é dia seguinte (infere pelos horários: se chegada < partida, provavelmente cruzou meia-noite)
  const nextDay = useMemo(() => {
    if (!mainOption?.departureTime || !mainOption?.arrivalTime) return false
    try {
      const [depH, depM] = mainOption.departureTime.split(':').map(Number)
      const [arrH, arrM] = mainOption.arrivalTime.split(':').map(Number)
      const depMinutes = depH * 60 + depM
      const arrMinutes = arrH * 60 + arrM
      return arrMinutes < depMinutes
    } catch {
      return false
    }
  }, [mainOption])

  return (
    <>
      {/* Card compacto */}
      <div
        onClick={onSelect}
        className={cn(
          "bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-200 cursor-pointer",
          isSelected
            ? "border-2 border-blue-500"
            : "border border-slate-200"
        )}
      >
        {/* Header: Companhia + Preço + Check */}
        <div className="p-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            {/* Logo companhia */}
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", airlineColors.bg)}>
              <span className={cn("text-xs font-bold", airlineColors.text)}>
                {airlineCode || 'FL'}
              </span>
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-900">
                {mainOption?.airlineName || 'Voo'} {mainOption?.flightNumber || ''}
              </p>
              <p className="text-xs text-slate-500">
                {mainOption?.cabinClass || 'Econômica'}
              </p>
            </div>
          </div>

          {/* Preço + Check */}
          <div className="flex items-center gap-2">
            <p className="font-bold text-emerald-600">
              {formatPrice(calculatedTotalPrice || flightData.totalPrice)}
            </p>
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center",
              isSelected ? "bg-blue-600" : "bg-white border-2 border-slate-300"
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        </div>

        {/* Rota Visual */}
        <div className="p-3">
          <div className="flex items-center justify-between">
            {/* Origem */}
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">
                {outboundLeg?.originCode || '---'}
              </p>
              <p className="text-xs text-slate-500">
                {formatTime(mainOption?.departureTime)}
              </p>
            </div>

            {/* Duração visual */}
            <div className="flex-1 px-4">
              <div className="flex items-center">
                <div className="h-0.5 flex-1 bg-slate-200" />
                <div className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                  {duration || '—'}
                </div>
                <div className="h-0.5 flex-1 bg-slate-200" />
              </div>
              <p className="text-center text-xs text-slate-400 mt-1">
                {stops === 0 ? 'Direto' : `${stops} parada${stops > 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Destino */}
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">
                {outboundLeg?.destinationCode || '---'}
              </p>
              <p className="text-xs text-slate-500">
                {formatTime(mainOption?.arrivalTime)}{nextDay ? ' +1' : ''}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex justify-center gap-2 mt-3">
            {mainOption?.baggage && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                {mainOption.baggage}
              </span>
            )}
            {hasReturn && (
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">
                Ida e Volta
              </span>
            )}
          </div>

          {/* Ver opções / itinerário completo */}
          {(flightData.legs.length > 1 || hasReturn || hasMultipleOptions) && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowModal(true)
              }}
              className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1 py-1.5"
            >
              <Info className="h-3 w-3" />
              {hasMultipleOptions
                ? `Ver ${totalOptionsCount} opções de voo`
                : `Ver ${flightData.legs.length} trechos`
              }
            </button>
          )}
        </div>
      </div>

      {/* Modal de itinerário completo */}
      {showModal && (
        <FlightItineraryModal
          flightData={flightData}
          isSelected={isSelected}
          totalPrice={calculatedTotalPrice || flightData.totalPrice}
          getSelectedOptionForLeg={getSelectedOptionForLeg}
          onSelectLegOption={handleSelectLegOption}
          onClose={() => setShowModal(false)}
          onSelect={() => {
            onSelect()
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}

// Modal de itinerário
interface FlightItineraryModalProps {
  flightData: NonNullable<ReturnType<typeof readFlightData>>
  isSelected: boolean
  totalPrice: number
  getSelectedOptionForLeg: (leg: FlightLegViewData) => FlightOptionViewData | null
  onSelectLegOption: (legId: string, optionId: string) => void
  onClose: () => void
  onSelect: () => void
}

function FlightItineraryModal({
  flightData,
  isSelected,
  totalPrice,
  getSelectedOptionForLeg,
  onSelectLegOption,
  onClose,
  onSelect,
}: FlightItineraryModalProps) {
  const outboundLegs = flightData.legs.filter(l => l.type === 'outbound' || l.type === 'connection')
  const returnLegs = flightData.legs.filter(l => l.type === 'return')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-2xl rounded-t-2xl max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-4 border-b",
          isSelected ? "bg-emerald-50" : "bg-gradient-to-r from-sky-50 to-indigo-50"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isSelected ? "bg-emerald-100" : "bg-sky-100"
            )}>
              <Plane className={cn("h-5 w-5", isSelected ? "text-emerald-600" : "text-sky-600")} />
            </div>
            <div>
              <span className="font-semibold text-slate-800 block">Itinerário Aéreo</span>
              <span className="text-xs text-slate-500">
                {flightData.legs.length} trecho{flightData.legs.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center hover:bg-slate-50"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto max-h-[60vh]">
          {/* IDA */}
          {outboundLegs.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100">
                <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-2">
                  <Plane className="h-3 w-3" />
                  IDA
                </span>
              </div>
              {outboundLegs.map(leg => {
                const selectedOpt = getSelectedOptionForLeg(leg)
                const hasMultipleOptions = leg.allOptions.length > 1

                return (
                  <div key={leg.id} className="border-b border-slate-100 last:border-b-0">
                    {/* Header do trecho */}
                    <div className="px-4 py-2 bg-slate-50 text-xs text-slate-600 flex items-center justify-between">
                      <span>{leg.originCode} → {leg.destinationCode}</span>
                      <span>{formatDateWithWeekday(leg.date)}</span>
                    </div>

                    {/* Opções do trecho */}
                    <div className="divide-y divide-slate-50">
                      {leg.allOptions.map(option => (
                        <LegOptionCard
                          key={option.id}
                          leg={leg}
                          option={option}
                          isSelected={selectedOpt?.id === option.id}
                          onSelect={() => onSelectLegOption(leg.id, option.id)}
                          showSelection={hasMultipleOptions}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* VOLTA */}
          {returnLegs.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="px-4 py-2 bg-indigo-50/50 border-b border-indigo-100">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                  <Plane className="h-3 w-3 rotate-180" />
                  VOLTA
                </span>
              </div>
              {returnLegs.map(leg => {
                const selectedOpt = getSelectedOptionForLeg(leg)
                const hasMultipleOptions = leg.allOptions.length > 1

                return (
                  <div key={leg.id} className="border-b border-slate-100 last:border-b-0">
                    {/* Header do trecho */}
                    <div className="px-4 py-2 bg-slate-50 text-xs text-slate-600 flex items-center justify-between">
                      <span>{leg.originCode} → {leg.destinationCode}</span>
                      <span>{formatDateWithWeekday(leg.date)}</span>
                    </div>

                    {/* Opções do trecho */}
                    <div className="divide-y divide-slate-50">
                      {leg.allOptions.map(option => (
                        <LegOptionCard
                          key={option.id}
                          leg={leg}
                          option={option}
                          isSelected={selectedOpt?.id === option.id}
                          onSelect={() => onSelectLegOption(leg.id, option.id)}
                          showSelection={hasMultipleOptions}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className={cn(
              "text-2xl font-bold",
              isSelected ? "text-emerald-600" : "text-slate-900"
            )}>
              {formatPrice(totalPrice)}
            </p>
          </div>
          <button
            onClick={onSelect}
            className={cn(
              "px-6 py-3 rounded-xl font-semibold text-sm transition-all min-h-[48px]",
              isSelected
                ? "bg-emerald-600 text-white"
                : "bg-sky-600 text-white hover:bg-sky-700"
            )}
          >
            {isSelected ? '✓ Selecionado' : 'Selecionar este voo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Card de opção de voo (clicável para seleção)
interface LegOptionCardProps {
  leg: FlightLegViewData
  option: FlightOptionViewData
  isSelected: boolean
  onSelect: () => void
  showSelection: boolean
}

function LegOptionCard({ leg, option, isSelected, onSelect, showSelection }: LegOptionCardProps) {
  const airlineColors = AIRLINE_COLORS[option.airlineCode] || { bg: 'bg-slate-100', text: 'text-slate-700' }

  // Calcula duração usando a opção específica
  const tempLeg = { ...leg, selectedOption: option }
  const duration = calculateLegDuration(tempLeg)

  return (
    <div
      onClick={showSelection ? onSelect : undefined}
      className={cn(
        "p-4 transition-all",
        showSelection && "cursor-pointer hover:bg-slate-50",
        isSelected && showSelection && "bg-blue-50 border-l-4 border-l-blue-500"
      )}
    >
      {/* Header: Companhia + Preço + Seleção */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Radio quando há múltiplas opções */}
          {showSelection && (
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center",
              isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300"
            )}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          )}
          <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold", airlineColors.bg, airlineColors.text)}>
            {option.airlineName}
          </div>
          <span className="text-xs text-slate-500 font-mono">#{option.flightNumber}</span>
        </div>
        <div className={cn(
          "font-bold",
          isSelected ? "text-blue-600" : "text-emerald-600"
        )}>
          {formatPrice(option.price)}
        </div>
      </div>

      {/* Rota visual */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-lg font-bold text-slate-900">{formatTime(option.departureTime)}</div>
          <div className="text-xs font-medium text-slate-600">{leg.originCode}</div>
          <div className="text-[10px] text-slate-400 truncate">{leg.originCity}</div>
        </div>

        <div className="flex flex-col items-center px-2">
          <div className="text-[10px] text-slate-400 mb-1">{duration}</div>
          <div className="w-16 h-[1px] bg-slate-200 relative">
            <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 rotate-90" />
          </div>
          {option.stops > 0 ? (
            <div className="text-[10px] text-amber-600 mt-1">
              {option.stops} parada{option.stops > 1 ? 's' : ''}
            </div>
          ) : (
            <div className="text-[10px] text-emerald-600 mt-1">Direto</div>
          )}
        </div>

        <div className="flex-1 text-right">
          <div className="text-lg font-bold text-slate-900">{formatTime(option.arrivalTime)}</div>
          <div className="text-xs font-medium text-slate-600">{leg.destinationCode}</div>
          <div className="text-[10px] text-slate-400 truncate">{leg.destinationCity}</div>
        </div>
      </div>

      {/* Bagagem e classe */}
      <div className="flex justify-center gap-2 mt-3">
        {option.baggage && (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded">
            ✓ {option.baggage}
          </span>
        )}
        {option.cabinClass && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
            {option.cabinClass}
          </span>
        )}
      </div>
    </div>
  )
}
