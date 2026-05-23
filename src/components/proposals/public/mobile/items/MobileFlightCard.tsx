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
import { formatDateWithWeekday, formatTime, extractNextDayOffset } from '../../shared/utils/dateUtils'

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

  // (a duração / horários / dia-seguinte agora são calculados dentro de
  //  LegMiniRow pra cada trecho separadamente — não há mais um único leg
  //  "principal" no display compacto)

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

        {/* Rota Visual — uma linha por trecho (IDA, VOLTA, conexões) */}
        <div className="p-3 space-y-2.5">
          {flightData.legs.map((leg) => (
            <LegMiniRow key={leg.id} leg={leg} />
          ))}

          {/* Badges + ação */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
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
            {(flightData.legs.length > 1 || hasReturn || hasMultipleOptions) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowModal(true)
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
              >
                <Info className="h-3 w-3" />
                {hasMultipleOptions
                  ? `Ver ${totalOptionsCount} opções`
                  : 'Ver detalhes'
                }
              </button>
            )}
          </div>
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

// Linha compacta de UM trecho (IDA, VOLTA ou conexão).
// Usa a opção recomendada/selecionada do leg.
function LegMiniRow({ leg }: { leg: FlightLegViewData }) {
  const option = leg.selectedOption || leg.allOptions[0]
  if (!option) return null

  // Resolve sufixo "+N" do horário de chegada (dia seguinte)
  const arrivalSuffix = extractNextDayOffset(option.arrivalTime)
  const dep = formatTime(option.departureTime)
  const arr = formatTime(option.arrivalTime)

  // Duração + paradas
  const duration = calculateLegDuration({ ...leg, selectedOption: option })
  const stops = option.stops ?? 0
  const stopsText = stops === 0 ? 'direto' : stops === 1 ? '1 parada' : `${stops} paradas`

  // Cor do label por tipo de leg
  const legLabel = leg.label || (leg.type === 'return' ? 'VOLTA' : leg.type === 'connection' ? 'TRECHO' : 'IDA')
  const labelColor =
    leg.type === 'return' ? 'bg-emerald-100 text-emerald-700'
    : leg.type === 'connection' ? 'bg-violet-100 text-violet-700'
    : 'bg-sky-100 text-sky-700'

  return (
    <div className="flex items-center gap-2.5 text-sm">
      {/* Label IDA/VOLTA */}
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex-shrink-0",
        labelColor
      )}>
        {legLabel}
      </span>

      {/* Origem */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className="font-semibold text-slate-900">{leg.originCode || '---'}</span>
        <span className="text-xs text-slate-500 tabular-nums">{dep}</span>
      </div>

      {/* Linha horizontal com duração/paradas */}
      <div className="flex-1 flex items-center min-w-0 px-1">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] text-slate-400 px-1.5 whitespace-nowrap">
          {duration || '—'} · {stopsText}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Destino */}
      <div className="flex items-baseline gap-1 flex-shrink-0">
        <span className="font-semibold text-slate-900">{leg.destinationCode || '---'}</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {arr}
          {arrivalSuffix && (
            <span className="ml-0.5 text-[10px] font-semibold text-amber-600">{arrivalSuffix}</span>
          )}
        </span>
      </div>
    </div>
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

  // Render de uma section (IDA ou VOLTA) — usado pra IDA e VOLTA sem repetir JSX
  const renderSection = (
    title: 'IDA' | 'VOLTA',
    legs: FlightLegViewData[],
    tone: 'sky' | 'indigo',
  ) => {
    if (legs.length === 0) return null
    const headerBg = tone === 'sky' ? 'bg-sky-600' : 'bg-indigo-600'

    return (
      <section>
        {/* Section header — bem forte, sticky pra ficar claro onde está */}
        <div className={cn('sticky top-0 z-10 px-4 py-3 flex items-center gap-2 text-white shadow-sm', headerBg)}>
          <Plane className={cn('h-4 w-4', tone === 'indigo' && 'rotate-180')} />
          <span className="text-sm font-bold uppercase tracking-wider">{title}</span>
          <span className="ml-auto text-[11px] text-white/80">
            {legs.length} trecho{legs.length > 1 ? 's' : ''}
          </span>
        </div>

        {legs.map(leg => {
          const selectedOpt = getSelectedOptionForLeg(leg)
          const hasMultipleOptions = leg.allOptions.length > 1

          return (
            <div key={leg.id}>
              {/* Header do trecho */}
              <div className="px-4 pt-3 pb-2 bg-white">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {leg.originCode}
                    <span className="mx-1.5 text-slate-400">→</span>
                    {leg.destinationCode}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatDateWithWeekday(leg.date)}
                  </div>
                </div>
                {(leg.originCity || leg.destinationCity) && (
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {leg.originCity} — {leg.destinationCity}
                  </div>
                )}
              </div>

              {/* Opções do trecho */}
              <div className="divide-y divide-slate-100">
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
      </section>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-2xl rounded-t-2xl max-h-[88vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <Plane className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <span className="font-semibold text-slate-900 block text-sm">Itinerário Aéreo</span>
              <span className="text-[11px] text-slate-500">
                {flightData.legs.length} trecho{flightData.legs.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Conteúdo — sections divididas com gap explícito entre IDA e VOLTA */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {renderSection('IDA', outboundLegs, 'sky')}
          {outboundLegs.length > 0 && returnLegs.length > 0 && (
            <div className="h-3 bg-slate-100" aria-hidden />
          )}
          {renderSection('VOLTA', returnLegs, 'indigo')}
        </div>

        {/* Footer — Total neutro, botão de ação separado.
            Verde só pra confirmar "Selecionado" (estado terminal). */}
        <div className="flex-shrink-0 p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">
              {formatPrice(totalPrice)}
            </p>
          </div>
          <button
            onClick={onSelect}
            className={cn(
              'px-5 py-3 rounded-xl font-semibold text-sm transition-all min-h-[48px] inline-flex items-center gap-2',
              isSelected
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-sky-600 text-white hover:bg-sky-700',
            )}
          >
            {isSelected ? (
              <>
                <Check className="h-4 w-4" />
                Selecionado
              </>
            ) : (
              'Selecionar voo'
            )}
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
  const airlineColors = AIRLINE_COLORS[option.airlineCode] || { bg: 'bg-slate-100', text: 'text-slate-800' }
  const duration = calculateLegDuration({ ...leg, selectedOption: option })
  const stops = option.stops ?? 0
  const stopsText = stops === 0 ? 'Direto' : `${stops} parada${stops > 1 ? 's' : ''}`

  return (
    <div
      onClick={showSelection ? onSelect : undefined}
      className={cn(
        'relative px-4 py-3 bg-white transition-colors',
        // Borda lateral grossa só quando selecionado E há múltiplas opções —
        // dá um sinal visual forte sem competir quando há só 1 opção.
        showSelection && 'cursor-pointer hover:bg-slate-50',
        isSelected && showSelection && 'bg-sky-50/40 border-l-4 border-l-sky-600',
        !(isSelected && showSelection) && 'border-l-4 border-l-transparent',
      )}
    >
      {/* Linha 1: radio + companhia | preço */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showSelection && (
            <div
              className={cn(
                'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                isSelected ? 'border-sky-600' : 'border-slate-300',
              )}
            >
              {isSelected && <div className="w-2 h-2 rounded-full bg-sky-600" />}
            </div>
          )}
          <span className={cn('px-2 py-0.5 rounded text-[11px] font-bold flex-shrink-0', airlineColors.bg, airlineColors.text)}>
            {option.airlineName || option.airlineCode}
          </span>
          <span className="text-[11px] text-slate-400 font-mono truncate">
            #{option.flightNumber}
          </span>
        </div>
        <div className="font-bold text-base text-slate-900 flex-shrink-0">
          {formatPrice(option.price)}
        </div>
      </div>

      {/* Linha 2: horários + duração + paradas */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold text-slate-900 leading-tight">{formatTime(option.departureTime)}</div>
          <div className="text-[11px] text-slate-500">{leg.originCode}</div>
        </div>

        <div className="flex flex-col items-center px-2">
          <div className="text-[10px] text-slate-500">{duration}</div>
          <div className="w-14 h-px bg-slate-200 my-1" />
          <div className={cn('text-[10px] font-medium', stops === 0 ? 'text-emerald-600' : 'text-slate-500')}>
            {stopsText}
          </div>
        </div>

        <div className="flex-1 min-w-0 text-right">
          <div className="text-lg font-bold text-slate-900 leading-tight">{formatTime(option.arrivalTime)}</div>
          <div className="text-[11px] text-slate-500">{leg.destinationCode}</div>
        </div>
      </div>

      {/* Linha 3: tags (sugerida | bagagem | classe) — todas no mesmo registro */}
      {(option.isRecommended || option.baggage || option.cabinClass) && (
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          {option.isRecommended && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wide">
              Sugerida
            </span>
          )}
          {option.baggage && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px]">
              {option.baggage}
            </span>
          )}
          {option.cabinClass && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
              {option.cabinClass}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
