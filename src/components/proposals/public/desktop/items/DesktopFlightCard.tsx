/**
 * DesktopFlightCard — versão expandida com todas as opções por trecho.
 *
 * Layout:
 *   - Header com companhia (do trecho selecionado) + preço total + check pra
 *     adicionar/remover o voo da seleção.
 *   - Para cada trecho (IDA / VOLTA / conexões): lista todas as opções como
 *     linhas clicáveis. Quando há >1 opção, vira radio (cliente escolhe qual).
 *   - Preço total recalcula com base na opção escolhida em cada trecho.
 *
 * Lógica de seleção espelha o MobileFlightCard:
 * `selectedOptionId` é serializado como `legId1:optId1,legId2:optId2`.
 */

import { useMemo, useCallback } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Plane, Check, Luggage } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readFlightData, calculateLegDuration } from '../../shared/readers'
import type { FlightLegViewData, FlightOptionViewData } from '../../shared/types'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateWithWeekday, formatTime, extractNextDayOffset } from '../../shared/utils/dateUtils'
import { CABIN_CLASS_LABELS } from '../../shared/types'

interface DesktopFlightCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption?: (optionId: string) => void
}

const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
  'LA': { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  'G3': { bg: 'bg-orange-50', text: 'text-orange-700' },
  'AD': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'AA': { bg: 'bg-red-50', text: 'text-red-700' },
  'UA': { bg: 'bg-sky-50', text: 'text-sky-700' },
  'DL': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'AF': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'TP': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'IB': { bg: 'bg-red-50', text: 'text-red-700' },
  'LH': { bg: 'bg-yellow-50', text: 'text-yellow-700' },
}

export function DesktopFlightCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
}: DesktopFlightCardProps) {
  const flightData = readFlightData(item)

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

  const getSelectedOptionForLeg = useCallback((leg: FlightLegViewData) => {
    const userSelectedId = selectedOptionsMap.get(leg.id)
    if (userSelectedId) {
      return leg.allOptions.find(o => o.id === userSelectedId) || leg.selectedOption
    }
    return leg.selectedOption
  }, [selectedOptionsMap])

  const handleSelectLegOption = useCallback((legId: string, optionId: string) => {
    if (!onSelectOption) return
    const newMap = new Map(selectedOptionsMap)
    newMap.set(legId, optionId)
    const pairs = Array.from(newMap.entries()).map(([l, o]) => `${l}:${o}`)
    onSelectOption(pairs.join(','))
  }, [selectedOptionsMap, onSelectOption])

  const calculatedTotal = useMemo(() => {
    if (!flightData) return 0
    return flightData.legs.reduce((sum, leg) => {
      const opt = getSelectedOptionForLeg(leg)
      return sum + (opt?.price || 0)
    }, 0)
  }, [flightData, getSelectedOptionForLeg])

  const hasValidOptions = flightData?.legs.some(leg => leg.allOptions.length > 0)

  if (!flightData || flightData.legs.length === 0 || !hasValidOptions) {
    return (
      <div className="p-8 bg-sky-50 rounded-2xl text-center border-2 border-dashed border-sky-200">
        <Plane className="h-12 w-12 text-sky-300 mx-auto mb-3" />
        <p className="text-sky-700 font-medium">Nenhum voo configurado</p>
        <p className="text-sky-500 text-sm mt-1">Entre em contato com seu consultor</p>
      </div>
    )
  }

  const outboundLegs = flightData.legs.filter(l => l.type === 'outbound' || l.type === 'connection')
  const returnLegs = flightData.legs.filter(l => l.type === 'return')
  const hasReturn = returnLegs.length > 0

  const mainLeg = outboundLegs[0]
  const mainOption = mainLeg ? getSelectedOptionForLeg(mainLeg) : null
  const airlineCode = mainOption?.airlineCode || ''
  const airlineColors = AIRLINE_COLORS[airlineCode] || { bg: 'bg-slate-50', text: 'text-slate-700' }

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border bg-white",
        isSelected
          ? "border-sky-500 shadow-lg shadow-sky-500/10 ring-1 ring-sky-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      )}
    >
      {/* Header */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between border-b border-slate-100",
        isSelected ? "bg-sky-50/40" : "bg-white"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", airlineColors.bg)}>
            <span className={cn("text-sm font-bold", airlineColors.text)}>
              {airlineCode || 'FL'}
            </span>
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {mainOption?.airlineName || item.title || 'Passagem Aérea'}
            </h3>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", airlineColors.bg, airlineColors.text)}>
                {CABIN_CLASS_LABELS[mainOption?.cabinClass || ''] || mainOption?.cabinClass || 'Econômica'}
              </span>
              {mainOption?.baggage && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Luggage className="h-3.5 w-3.5" />
                  {mainOption.baggage}
                </span>
              )}
              {hasReturn && (
                <span className="text-indigo-600 font-medium">Ida e Volta</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={cn(
              "text-2xl font-bold",
              isSelected ? "text-sky-600" : "text-slate-700"
            )}>
              {formatPrice(calculatedTotal || flightData.totalPrice)}
            </p>
            {flightData.legs.length > 1 && (
              <p className="text-sm text-slate-500">
                {flightData.legs.length} trechos
              </p>
            )}
          </div>

          <button
            onClick={onSelect}
            className={cn(
              "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
              isSelected
                ? "border-sky-600 bg-sky-600"
                : "border-slate-300 hover:border-sky-400 bg-white"
            )}
            aria-label={isSelected ? 'Remover voo' : 'Selecionar voo'}
          >
            {isSelected && <Check className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>

      {/* Trechos */}
      <div className="divide-y divide-slate-100">
        {outboundLegs.length > 0 && (
          <LegBlock
            label="IDA"
            tone="sky"
            legs={outboundLegs}
            getSelected={getSelectedOptionForLeg}
            onSelectOption={handleSelectLegOption}
            canSelect={!!onSelectOption}
          />
        )}

        {returnLegs.length > 0 && (
          <LegBlock
            label="VOLTA"
            tone="indigo"
            legs={returnLegs}
            getSelected={getSelectedOptionForLeg}
            onSelectOption={handleSelectLegOption}
            canSelect={!!onSelectOption}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Bloco de um trecho (IDA / VOLTA), com todas as opções listadas
// ============================================================

function LegBlock({
  label,
  tone,
  legs,
  getSelected,
  onSelectOption,
  canSelect,
}: {
  label: string
  tone: 'sky' | 'indigo'
  legs: FlightLegViewData[]
  getSelected: (leg: FlightLegViewData) => FlightOptionViewData | null | undefined
  onSelectOption: (legId: string, optionId: string) => void
  canSelect: boolean
}) {
  const headerBg = tone === 'sky' ? 'bg-sky-50/50 border-sky-100' : 'bg-indigo-50/50 border-indigo-100'
  const headerText = tone === 'sky' ? 'text-sky-700' : 'text-indigo-700'

  return (
    <div>
      <div className={cn("px-5 py-2 border-b", headerBg)}>
        <span className={cn("text-xs font-bold uppercase tracking-wide flex items-center gap-2", headerText)}>
          <Plane className={cn("h-3.5 w-3.5", tone === 'indigo' && 'rotate-180')} />
          {label}
        </span>
      </div>

      {legs.map(leg => {
        const selected = getSelected(leg)
        const showSelection = leg.allOptions.length > 1
        return (
          <div key={leg.id}>
            <div className="px-5 py-2 bg-slate-50/60 border-b border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span className="font-medium">
                {leg.originCode} ({leg.originCity}) → {leg.destinationCode} ({leg.destinationCity})
              </span>
              <span>{formatDateWithWeekday(leg.date)}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {leg.allOptions.map(option => (
                <OptionRow
                  key={option.id}
                  leg={leg}
                  option={option}
                  isSelected={selected?.id === option.id}
                  onSelect={() => canSelect && showSelection && onSelectOption(leg.id, option.id)}
                  showSelection={showSelection && canSelect}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Linha de uma opção (radio + horários + duração + preço)
// ============================================================

function OptionRow({
  leg,
  option,
  isSelected,
  onSelect,
  showSelection,
}: {
  leg: FlightLegViewData
  option: FlightOptionViewData
  isSelected: boolean
  onSelect: () => void
  showSelection: boolean
}) {
  const airlineColors = AIRLINE_COLORS[option.airlineCode] || { bg: 'bg-slate-100', text: 'text-slate-700' }
  const duration = calculateLegDuration({ ...leg, selectedOption: option })
  const nextDay = extractNextDayOffset(option.arrivalTime)
  const stops = option.stops ?? 0
  const stopsText = stops === 0 ? 'Direto' : `${stops} parada${stops > 1 ? 's' : ''}`

  return (
    <div
      onClick={showSelection ? onSelect : undefined}
      className={cn(
        "px-5 py-3 flex items-center gap-6 transition-colors",
        showSelection && "cursor-pointer hover:bg-slate-50",
        isSelected && showSelection && "bg-sky-50/40 border-l-2 border-l-sky-500"
      )}
    >
      {/* Radio (quando há múltiplas opções) */}
      {showSelection && (
        <div className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
          isSelected ? "border-sky-600 bg-sky-600" : "border-slate-300"
        )}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      {/* Companhia + número */}
      <div className="flex items-center gap-2 w-44 flex-shrink-0">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", airlineColors.bg)}>
          <span className={cn("text-xs font-bold", airlineColors.text)}>{option.airlineCode}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-900 truncate">{option.airlineName}</p>
          <p className="text-xs text-slate-500 font-mono">#{option.flightNumber}</p>
        </div>
      </div>

      {/* Rota visual */}
      <div className="flex-1 flex items-center gap-3">
        <div className="text-right">
          <p className="text-base font-bold text-slate-900">{formatTime(option.departureTime)}</p>
          <p className="text-xs text-slate-500">{leg.originCode}</p>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="text-[10px] text-slate-500">{duration}</div>
          <div className="w-full h-px bg-slate-200 my-1" />
          <div className={cn(
            "text-[10px]",
            stops === 0 ? "text-emerald-600" : "text-amber-600"
          )}>
            {stopsText}
          </div>
        </div>

        <div>
          <p className="text-base font-bold text-slate-900">
            {formatTime(option.arrivalTime)}
            {nextDay && (
              <span className="ml-0.5 text-[10px] font-semibold text-amber-600">{nextDay}</span>
            )}
          </p>
          <p className="text-xs text-slate-500">{leg.destinationCode}</p>
        </div>
      </div>

      {/* Bagagem + classe */}
      <div className="hidden lg:flex flex-col items-end gap-1 w-32 flex-shrink-0">
        {option.baggage && (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded">
            {option.baggage}
          </span>
        )}
        {option.cabinClass && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">
            {CABIN_CLASS_LABELS[option.cabinClass] || option.cabinClass}
          </span>
        )}
      </div>

      {/* Preço */}
      <div className="w-24 text-right flex-shrink-0">
        <p className={cn(
          "font-bold",
          isSelected ? "text-sky-600" : "text-slate-700"
        )}>
          {formatPrice(option.price)}
        </p>
      </div>
    </div>
  )
}
