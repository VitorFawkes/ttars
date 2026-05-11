/**
 * Reader para dados de Voo
 *
 * Lê rich_content.flights do Builder V4 e retorna FlightsViewData
 *
 * ESTRUTURA DO BUILDER:
 * flights: {
 *   legs: [{
 *     id, leg_type, origin_code, origin_city, destination_code, destination_city, date,
 *     options: [{
 *       id, airline_code, airline_name, flight_number,
 *       departure_time, arrival_time, cabin_class, baggage, price, ...
 *     }]
 *   }]
 * }
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { FlightsViewData, FlightLegViewData, FlightOptionViewData } from '../types'
import { CABIN_CLASS_LABELS } from '../types'

/**
 * Extrai dados de voos do item
 * Retorna null se não for um item de voo válido
 */
export function readFlightData(item: ProposalItemWithOptions): FlightsViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace flights
  const flights = rc?.flights as Record<string, unknown> | undefined

  if (!flights) {
    // Tenta ler formato legado (segments direto no rc)
    if (Array.isArray(rc?.segments) && rc.segments.length > 0) {
      return readLegacyFlightData(item, rc)
    }
    // Tenta ler formato legado (legs direto no rc)
    if (Array.isArray(rc?.legs) && rc.legs.length > 0) {
      return readLegsFromRoot(item, rc)
    }
    return null
  }

  const rawLegs = flights.legs as Array<Record<string, unknown>> | undefined
  if (!rawLegs || rawLegs.length === 0) return null

  let calculatedTotalPrice = 0

  const legs: FlightLegViewData[] = rawLegs.map(leg => {
    const rawOptions = (leg.options as Array<Record<string, unknown>>) || []

    const options: FlightOptionViewData[] = rawOptions
      .filter(opt => opt.enabled !== false)
      .map(opt => {
        const cabinClass = String(opt.cabin_class || 'economy')
        return {
          id: String(opt.id || ''),
          airlineCode: String(opt.airline_code || ''),
          airlineName: String(opt.airline_name || ''),
          flightNumber: String(opt.flight_number || ''),
          departureTime: String(opt.departure_time || ''),
          arrivalTime: String(opt.arrival_time || ''),
          cabinClass: CABIN_CLASS_LABELS[cabinClass] || cabinClass,
          fareFamily: String(opt.fare_family || ''),
          equipment: String(opt.equipment || ''),
          stops: Number(opt.stops) || 0,
          baggage: String(opt.baggage || ''),
          price: Number(opt.price) || 0,
          currency: String(opt.currency || 'BRL'),
          isRecommended: Boolean(opt.is_recommended),
          enabled: opt.enabled !== false,
        }
      })

    // Seleciona opção recomendada ou primeira
    const selectedOption = options.find(o => o.isRecommended) || options[0] || null

    if (selectedOption) {
      calculatedTotalPrice += selectedOption.price
    }

    const legType = String(leg.leg_type || 'outbound') as 'outbound' | 'return' | 'connection'

    return {
      id: String(leg.id || ''),
      type: legType,
      label: String(leg.label || (legType === 'return' ? 'VOLTA' : 'IDA')),
      originCode: String(leg.origin_code || ''),
      originCity: String(leg.origin_city || ''),
      destinationCode: String(leg.destination_code || ''),
      destinationCity: String(leg.destination_city || ''),
      date: String(leg.date || ''),
      selectedOption,
      allOptions: options,
    }
  })

  // Para voos, prioriza o preço calculado das opções (não o base_price do item)
  // O base_price pode estar desatualizado, enquanto o preço das opções é sempre correto
  const totalPrice = calculatedTotalPrice || Number(item.base_price) || 0

  return {
    legs,
    showPrices: flights.show_prices !== false,
    allowMixAirlines: flights.allow_mix_airlines !== false,
    totalPrice,
  }
}

/**
 * Lê formato legado com segments
 */
function readLegacyFlightData(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): FlightsViewData {
  const segments = rc.segments as Array<Record<string, unknown>>

  // Agrupa segments em legs (IDA e VOLTA)
  const { outbound, returnSegs } = groupSegmentsIntoLegs(segments)

  const legs: FlightLegViewData[] = []

  if (outbound.length > 0) {
    legs.push(createLegFromSegments(outbound, 'outbound', 'IDA'))
  }

  if (returnSegs.length > 0) {
    legs.push(createLegFromSegments(returnSegs, 'return', 'VOLTA'))
  }

  return {
    legs,
    showPrices: rc.show_prices !== false,
    allowMixAirlines: rc.allow_mix_airlines !== false,
    totalPrice: Number(item.base_price) || 0,
  }
}

/**
 * Lê formato com legs direto no root
 */
function readLegsFromRoot(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): FlightsViewData {
  const rawLegs = rc.legs as Array<Record<string, unknown>>

  let calculatedTotalPrice = 0

  const legs: FlightLegViewData[] = rawLegs.map(leg => {
    const rawOptions = (leg.options as Array<Record<string, unknown>>) || []

    const options: FlightOptionViewData[] = rawOptions
      .filter(opt => opt.enabled !== false)
      .map(opt => ({
        id: String(opt.id || ''),
        airlineCode: String(opt.airline_code || ''),
        airlineName: String(opt.airline_name || ''),
        flightNumber: String(opt.flight_number || ''),
        departureTime: String(opt.departure_time || ''),
        arrivalTime: String(opt.arrival_time || ''),
        cabinClass: String(opt.cabin_class || 'economy'),
        fareFamily: String(opt.fare_family || ''),
        equipment: String(opt.equipment || ''),
        stops: Number(opt.stops) || 0,
        baggage: String(opt.baggage || ''),
        price: Number(opt.price) || 0,
        currency: String(opt.currency || 'BRL'),
        isRecommended: Boolean(opt.is_recommended),
        enabled: true,
      }))

    const selectedOption = options.find(o => o.isRecommended) || options[0] || null
    if (selectedOption) calculatedTotalPrice += selectedOption.price

    const legType = String(leg.leg_type || 'outbound') as 'outbound' | 'return' | 'connection'

    return {
      id: String(leg.id || ''),
      type: legType,
      label: String(leg.label || (legType === 'return' ? 'VOLTA' : 'IDA')),
      originCode: String(leg.origin_code || ''),
      originCity: String(leg.origin_city || ''),
      destinationCode: String(leg.destination_code || ''),
      destinationCity: String(leg.destination_city || ''),
      date: String(leg.date || ''),
      selectedOption,
      allOptions: options,
    }
  })

  return {
    legs,
    showPrices: rc.show_prices !== false,
    allowMixAirlines: rc.allow_mix_airlines !== false,
    totalPrice: calculatedTotalPrice || Number(item.base_price) || 0,
  }
}

/**
 * Agrupa segments em IDA e VOLTA baseado na lógica de origem
 */
function groupSegmentsIntoLegs(segments: Array<Record<string, unknown>>): {
  outbound: Array<Record<string, unknown>>
  returnSegs: Array<Record<string, unknown>>
} {
  if (segments.length === 0) return { outbound: [], returnSegs: [] }
  if (segments.length === 1) return { outbound: segments, returnSegs: [] }

  const originAirport = String(segments[0].departure_airport || '')
  let returnStartIndex = -1

  // Procura o ponto onde volta para a origem
  for (let i = 1; i < segments.length; i++) {
    if (String(segments[i].arrival_airport) === originAirport) {
      // Encontrou retorno à origem, procura início da volta
      for (let j = i; j >= 1; j--) {
        if (String(segments[j - 1].arrival_airport) === String(segments[j].departure_airport)) {
          returnStartIndex = j
        } else {
          break
        }
      }
      if (returnStartIndex === -1) returnStartIndex = i
      break
    }
  }

  // Se não encontrou retorno por aeroporto, procura por gap de dias
  if (returnStartIndex === -1) {
    for (let i = 0; i < segments.length - 1; i++) {
      const d1 = new Date(String(segments[i].arrival_date))
      const d2 = new Date(String(segments[i + 1].departure_date))
      const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)
      if (diffDays > 2) {
        returnStartIndex = i + 1
        break
      }
    }
  }

  if (returnStartIndex === -1) {
    return { outbound: segments, returnSegs: [] }
  }

  return {
    outbound: segments.slice(0, returnStartIndex),
    returnSegs: segments.slice(returnStartIndex),
  }
}

/**
 * Cria um leg a partir de segments
 */
function createLegFromSegments(
  segments: Array<Record<string, unknown>>,
  type: 'outbound' | 'return',
  label: string
): FlightLegViewData {
  const first = segments[0]
  const last = segments[segments.length - 1]

  const cabinClass = String(first.cabin_class || 'economy')

  const option: FlightOptionViewData = {
    id: `seg-${type}`,
    airlineCode: String(first.airline_code || ''),
    airlineName: String(first.airline_name || ''),
    flightNumber: String(first.flight_number || ''),
    departureTime: String(first.departure_time || ''),
    arrivalTime: String(last.arrival_time || ''),
    cabinClass: CABIN_CLASS_LABELS[cabinClass] || cabinClass,
    fareFamily: '',
    equipment: '',
    stops: segments.length - 1,
    baggage: String(first.baggage_included || ''),
    price: 0,
    currency: 'BRL',
    isRecommended: true,
    enabled: true,
  }

  return {
    id: `leg-${type}`,
    type,
    label,
    originCode: String(first.departure_airport || ''),
    originCity: String(first.departure_city || ''),
    destinationCode: String(last.arrival_airport || ''),
    destinationCity: String(last.arrival_city || ''),
    date: String(first.departure_date || ''),
    selectedOption: option,
    allOptions: [option],
  }
}

/**
 * Verifica se o item é um voo válido
 */
export function isFlightItem(item: ProposalItemWithOptions): boolean {
  if (item.item_type === 'flight') return true

  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.flights || rc?.legs || rc?.segments)
}

/**
 * Calcula duração total de um leg
 */
export function calculateLegDuration(leg: FlightLegViewData): string {
  const option = leg.selectedOption
  if (!option) return ''

  const depTime = option.departureTime
  const arrTime = option.arrivalTime

  if (!depTime || !arrTime) return ''

  try {
    // Assume mesmo dia se não tiver data completa
    const depDate = new Date(`2000-01-01T${depTime}:00`)
    let arrDate = new Date(`2000-01-01T${arrTime}:00`)

    // Se chegada é antes da partida, assume dia seguinte
    if (arrDate < depDate) {
      arrDate = new Date(`2000-01-02T${arrTime}:00`)
    }

    const diffMs = arrDate.getTime() - depDate.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (hours === 0) return `${mins}min`
    if (mins === 0) return `${hours}h`
    return `${hours}h${mins}min`
  } catch {
    return ''
  }
}
