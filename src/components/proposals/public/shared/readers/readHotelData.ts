/**
 * Reader para dados de Hotel
 *
 * Lê rich_content.hotel do Builder V4 e retorna HotelViewData
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { HotelViewData, HotelOptionViewData } from '../types'
import { calculateNights } from '../utils/dateUtils'
import { BOARD_TYPE_LABELS } from '../types'

/**
 * Extrai dados de hotel do item
 * Retorna null se não for um item de hotel válido
 */
export function readHotelData(item: ProposalItemWithOptions): HotelViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace hotel
  const hotel = rc?.hotel as Record<string, unknown> | undefined

  // Se não tem namespace hotel, verifica se é formato legado (flat)
  if (!hotel) {
    // Tenta ler formato flat (legado)
    if (rc?.hotel_name || rc?.location_city) {
      return readLegacyHotelData(item, rc)
    }
    return null
  }

  // Calcula noites
  const checkInDate = String(hotel.check_in_date || '')
  const checkOutDate = String(hotel.check_out_date || '')
  const nights = Number(hotel.nights) || calculateNights(checkInDate, checkOutDate)

  // Preço
  const pricePerNight = Number(hotel.price_per_night) || 0
  const totalPrice = pricePerNight * Math.max(1, nights)

  // Opções de upgrade
  const rawOptions = (hotel.options as Array<Record<string, unknown>>) || []
  const options: HotelOptionViewData[] = rawOptions
    .filter(opt => opt.enabled !== false)
    .map(opt => ({
      id: String(opt.id || ''),
      label: String(opt.label || ''),
      priceDelta: Number(opt.price_delta) || 0,
      isRecommended: Boolean(opt.is_recommended),
      enabled: opt.enabled !== false,
    }))

  // Board type label
  const boardType = String(hotel.board_type || '')
  const boardTypeLabel = BOARD_TYPE_LABELS[boardType] || boardType

  return {
    hotelName: String(hotel.hotel_name || item.title || ''),
    locationCity: String(hotel.location_city || ''),
    starRating: Number(hotel.star_rating) || 0,
    roomType: String(hotel.room_type || ''),
    boardType: boardTypeLabel,
    checkInDate,
    checkOutDate,
    checkInTime: String(hotel.check_in_time || '14:00'),
    checkOutTime: String(hotel.check_out_time || '12:00'),
    nights,
    pricePerNight,
    totalPrice,
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities.map(String) : [],
    cancellationPolicy: String(hotel.cancellation_policy || ''),
    description: hotel.description ? String(hotel.description) : null,
    notes: hotel.notes ? String(hotel.notes) : null,
    imageUrl: String(hotel.image_url || item.image_url || '') || null,
    images: Array.isArray(hotel.images) ? hotel.images.map(String).filter(Boolean) : [],
    options,
  }
}

/**
 * Lê formato legado (flat) para compatibilidade
 */
function readLegacyHotelData(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): HotelViewData {
  const checkInDate = String(rc.check_in_date || '')
  const checkOutDate = String(rc.check_out_date || '')
  const nights = Number(rc.nights) || calculateNights(checkInDate, checkOutDate)
  const pricePerNight = Number(rc.price_per_night) || Number(item.base_price) || 0

  const boardType = String(rc.board_type || '')
  const boardTypeLabel = BOARD_TYPE_LABELS[boardType] || boardType

  // Opções do item (tabela proposal_options)
  const options: HotelOptionViewData[] = (item.options || []).map(opt => ({
    id: opt.id,
    label: opt.option_label,
    priceDelta: Number(opt.price_delta) || 0,
    isRecommended: false,
    enabled: true,
  }))

  return {
    hotelName: String(rc.hotel_name || item.title || ''),
    locationCity: String(rc.location_city || ''),
    starRating: Number(rc.star_rating) || 0,
    roomType: String(rc.room_type || ''),
    boardType: boardTypeLabel,
    checkInDate,
    checkOutDate,
    checkInTime: String(rc.check_in_time || '14:00'),
    checkOutTime: String(rc.check_out_time || '12:00'),
    nights,
    pricePerNight,
    totalPrice: pricePerNight * Math.max(1, nights),
    amenities: Array.isArray(rc.amenities) ? rc.amenities.map(String) : [],
    cancellationPolicy: String(rc.cancellation_policy || ''),
    description: rc.description ? String(rc.description) : null,
    notes: rc.notes ? String(rc.notes) : null,
    imageUrl: String(rc.image_url || item.image_url || '') || null,
    images: Array.isArray(rc.images) ? rc.images.map(String).filter(Boolean) : [],
    options,
  }
}

/**
 * Verifica se o item é um hotel válido
 */
export function isHotelItem(item: ProposalItemWithOptions): boolean {
  if (item.item_type === 'hotel') return true

  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.hotel || rc?.hotel_name)
}
