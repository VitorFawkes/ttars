/**
 * Reader para dados de Cruzeiro
 *
 * Lê rich_content.cruise do Builder V4 e retorna CruiseViewData
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { CruiseViewData, CruiseOptionViewData, CruisePortViewData } from '../types'
import { calculateNights } from '../utils/dateUtils'
import { CRUISE_LINE_LABELS } from '../types'

/**
 * Extrai dados de cruzeiro do item
 * Retorna null se não for um item de cruzeiro válido
 */
export function readCruiseData(item: ProposalItemWithOptions): CruiseViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace cruise
  const cruise = rc?.cruise as Record<string, unknown> | undefined

  if (!cruise) {
    return null
  }

  // Cruise line com label
  const cruiseLine = String(cruise.cruise_line || '')
  const cruiseLineLabel = CRUISE_LINE_LABELS[cruiseLine] || cruiseLine

  // Datas e noites
  const embarkationDate = String(cruise.embarkation_date || '')
  const disembarkationDate = String(cruise.disembarkation_date || '')
  const nights = Number(cruise.nights) || calculateNights(embarkationDate, disembarkationDate)

  // Preço
  const priceType = String(cruise.price_type || 'total') as 'per_person' | 'total'
  const price = Number(cruise.price) || Number(item.base_price) || 0
  const passengers = Number(cruise.passengers) || 1
  const totalPrice = priceType === 'per_person' ? price * passengers : price

  // Portos
  const rawPorts = (cruise.ports as Array<Record<string, unknown>>) || []
  const ports: CruisePortViewData[] = rawPorts.map(port => ({
    id: String(port.id || ''),
    portName: String(port.port_name || ''),
    country: String(port.country || ''),
    arrivalDate: port.arrival_date ? String(port.arrival_date) : null,
    arrivalTime: port.arrival_time ? String(port.arrival_time) : null,
    departureTime: port.departure_time ? String(port.departure_time) : null,
    isEmbarkation: Boolean(port.is_embarkation),
    isDisembarkation: Boolean(port.is_disembarkation),
  }))

  // Opções de cabine
  const rawOptions = (cruise.options as Array<Record<string, unknown>>) || []
  const options: CruiseOptionViewData[] = rawOptions
    .filter(opt => opt.enabled !== false)
    .map(opt => ({
      id: String(opt.id || ''),
      cabinType: String(opt.cabin_type || ''),
      label: String(opt.label || ''),
      price: Number(opt.price) || 0,
      isRecommended: Boolean(opt.is_recommended),
      enabled: opt.enabled !== false,
    }))

  return {
    cruiseName: String(cruise.cruise_name || item.title || ''),
    cruiseLine: cruiseLineLabel,
    shipName: String(cruise.ship_name || ''),
    itinerary: String(cruise.itinerary || ''),
    ports,
    embarkationDate,
    embarkationPort: String(cruise.embarkation_port || ''),
    disembarkationDate,
    disembarkationPort: String(cruise.disembarkation_port || ''),
    nights,
    cabinType: String(cruise.cabin_type || ''),
    cabinNumber: cruise.cabin_number ? String(cruise.cabin_number) : null,
    deck: cruise.deck ? String(cruise.deck) : null,
    boardType: String(cruise.board_type || ''),
    priceType,
    price,
    passengers,
    totalPrice,
    description: cruise.description ? String(cruise.description) : null,
    included: Array.isArray(cruise.included) ? cruise.included.map(String) : [],
    cancellationPolicy: cruise.cancellation_policy ? String(cruise.cancellation_policy) : null,
    notes: cruise.notes ? String(cruise.notes) : null,
    imageUrl: String(cruise.image_url || item.image_url || '') || null,
    images: Array.isArray(cruise.images) ? cruise.images.map(String) : [],
    options,
  }
}

/**
 * Verifica se o item é um cruzeiro válido
 */
export function isCruiseItem(item: ProposalItemWithOptions): boolean {
  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.cruise)
}

/**
 * Labels para tipo de cabine
 */
export const CABIN_TYPE_LABELS: Record<string, string> = {
  inside: 'Interna',
  oceanview: 'Vista Mar',
  balcony: 'Com Varanda',
  suite: 'Suíte',
  haven: 'Haven',
}

/**
 * Labels para regime de bordo
 */
export const CRUISE_BOARD_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  full_board: 'Pensão Completa',
  drinks_included: 'Bebidas Inclusas',
  all_inclusive: 'All Inclusive',
}
