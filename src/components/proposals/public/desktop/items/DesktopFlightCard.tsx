/**
 * DesktopFlightCard - Card de voo otimizado para desktop
 *
 * Layout expandido com detalhes completos de todos os trechos,
 * timeline visual e informações de bagagem
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Plane, Check, Luggage, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readFlightData, calculateLegDuration } from '../../shared/readers'
import type { FlightLegViewData } from '../../shared/types'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateWithWeekday, formatTime } from '../../shared/utils/dateUtils'
import { CABIN_CLASS_LABELS } from '../../shared/types'

interface DesktopFlightCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  onSelect: () => void
}

// Cores das companhias aéreas
const AIRLINE_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  'LA': { bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'border-indigo-300' },
  'G3': { bg: 'bg-orange-50', text: 'text-orange-700', accent: 'border-orange-300' },
  'AD': { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'border-blue-300' },
  'AA': { bg: 'bg-red-50', text: 'text-red-700', accent: 'border-red-300' },
  'UA': { bg: 'bg-sky-50', text: 'text-sky-700', accent: 'border-sky-300' },
  'DL': { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'border-blue-300' },
  'AF': { bg: 'bg-blue-50', text: 'text-blue-700', accent: 'border-blue-300' },
  'TP': { bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'border-emerald-300' },
  'IB': { bg: 'bg-red-50', text: 'text-red-700', accent: 'border-red-300' },
  'LH': { bg: 'bg-yellow-50', text: 'text-yellow-700', accent: 'border-yellow-300' },
}

export function DesktopFlightCard({
  item,
  isSelected,
  onSelect,
}: DesktopFlightCardProps) {
  const [expandedLeg, setExpandedLeg] = useState<string | null>(null)

  const flightData = readFlightData(item)

  // Check if there's no flight data, no legs, or all legs have no options
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

  const mainOption = outboundLegs[0]?.selectedOption
  const airlineCode = mainOption?.airlineCode || ''
  const airlineColors = AIRLINE_COLORS[airlineCode] || { bg: 'bg-slate-50', text: 'text-slate-700', accent: 'border-slate-300' }

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border-2",
        isSelected
          ? "border-sky-500 bg-sky-50/30 shadow-lg shadow-sky-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      )}
    >
      {/* Header com companhia e preço */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between border-b",
        isSelected ? "bg-sky-50 border-sky-200" : "bg-gradient-to-r from-sky-50 to-indigo-50 border-slate-100"
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
              {formatPrice(flightData.totalPrice)}
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
          >
            {isSelected && <Check className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>

      {/* Trechos */}
      <div className="divide-y divide-slate-100">
        {/* IDA */}
        {outboundLegs.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-sky-50/50 border-b border-sky-100">
              <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-2">
                <Plane className="h-3.5 w-3.5" />
                IDA
              </span>
            </div>
            {outboundLegs.map((leg, index) => (
              <LegRow
                key={leg.id}
                leg={leg}
                isExpanded={expandedLeg === leg.id}
                onToggle={() => setExpandedLeg(expandedLeg === leg.id ? null : leg.id)}
                isLast={index === outboundLegs.length - 1}
              />
            ))}
          </div>
        )}

        {/* VOLTA */}
        {returnLegs.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-indigo-50/50 border-b border-indigo-100">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                <Plane className="h-3.5 w-3.5 rotate-180" />
                VOLTA
              </span>
            </div>
            {returnLegs.map((leg, index) => (
              <LegRow
                key={leg.id}
                leg={leg}
                isExpanded={expandedLeg === leg.id}
                onToggle={() => setExpandedLeg(expandedLeg === leg.id ? null : leg.id)}
                isLast={index === returnLegs.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Linha de um trecho
interface LegRowProps {
  leg: FlightLegViewData
  isExpanded: boolean
  onToggle: () => void
  isLast: boolean
}

function LegRow({ leg, isExpanded, onToggle, isLast }: LegRowProps) {
  const option = leg.selectedOption
  if (!option) return null

  const duration = calculateLegDuration(leg)
  const airlineColors = AIRLINE_COLORS[option.airlineCode] || { bg: 'bg-slate-100', text: 'text-slate-700', accent: 'border-slate-200' }

  return (
    <div className={cn(!isLast && "border-b border-slate-100")}>
      {/* Resumo do trecho */}
      <div
        className="px-5 py-4 flex items-center justify-between gap-6 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Companhia */}
        <div className="flex items-center gap-3 w-40">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", airlineColors.bg)}>
            <span className={cn("text-xs font-bold", airlineColors.text)}>{option.airlineCode}</span>
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-900">{option.airlineName}</p>
            <p className="text-xs text-slate-500 font-mono">{option.flightNumber}</p>
          </div>
        </div>

        {/* Data */}
        <div className="text-sm text-slate-600 w-32">
          {formatDateWithWeekday(leg.date)}
        </div>

        {/* Rota visual */}
        <div className="flex-1 flex items-center gap-4">
          {/* Partida */}
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{formatTime(option.departureTime)}</p>
            <p className="text-sm font-medium text-slate-600">{leg.originCode}</p>
          </div>

          {/* Timeline */}
          <div className="flex-1 flex items-center">
            <div className="w-2 h-2 rounded-full bg-slate-300" />
            <div className="flex-1 relative h-px bg-slate-200 mx-2">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-500 whitespace-nowrap">
                {duration} · {option.stops === 0 ? 'Direto' : `${option.stops} parada${option.stops > 1 ? 's' : ''}`}
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-slate-400" />
          </div>

          {/* Chegada */}
          <div>
            <p className="text-lg font-bold text-slate-900">{formatTime(option.arrivalTime)}</p>
            <p className="text-sm font-medium text-slate-600">{leg.destinationCode}</p>
          </div>
        </div>

        {/* Expandir */}
        <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>
      </div>

      {/* Detalhes expandidos */}
      {isExpanded && (
        <div className="px-5 pb-4 bg-slate-50/50">
          <div className="grid grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-slate-100">
            <DetailItem
              label="Aeronave"
              value={option.equipment || 'Não informado'}
            />
            <DetailItem
              label="Classe"
              value={CABIN_CLASS_LABELS[option.cabinClass] || option.cabinClass}
            />
            <DetailItem
              label="Família Tarifária"
              value={option.fareFamily || 'Não informado'}
            />
            <DetailItem
              label="Bagagem"
              value={option.baggage || 'Consultar'}
              highlight={!!option.baggage}
            />
          </div>

          {/* Cidades completas */}
          <div className="mt-3 flex items-center justify-center gap-4 text-sm text-slate-500">
            <span>{leg.originCity || leg.originCode}</span>
            <ArrowRight className="h-4 w-4" />
            <span>{leg.destinationCity || leg.destinationCode}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Item de detalhe
function DetailItem({
  label,
  value,
  highlight = false
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={cn(
        "text-sm font-medium",
        highlight ? "text-emerald-600" : "text-slate-800"
      )}>
        {value}
      </p>
    </div>
  )
}
