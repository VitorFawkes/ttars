/**
 * Reader para dados de Transfer
 *
 * Lê rich_content.transfer do Builder V4 e retorna TransferViewData
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { TransferViewData, TransferOptionViewData } from '../types'
import { VEHICLE_TYPE_LABELS } from '../types'

/**
 * Extrai dados de transfer do item
 * Retorna null se não for um item de transfer válido
 */
export function readTransferData(item: ProposalItemWithOptions): TransferViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace transfer
  const transfer = rc?.transfer as Record<string, unknown> | undefined

  // Se não tem namespace, verifica formato legado
  if (!transfer) {
    if (rc?.origin && rc?.destination) {
      return readLegacyTransferData(item, rc)
    }
    return null
  }

  // Vehicle type com label
  const vehicleType = String(transfer.vehicle_type || '')
  const vehicleLabel = VEHICLE_TYPE_LABELS[vehicleType] || vehicleType

  // Opções
  const rawOptions = (transfer.options as Array<Record<string, unknown>>) || []
  const options: TransferOptionViewData[] = rawOptions
    .filter(opt => opt.enabled !== false)
    .map(opt => ({
      id: String(opt.id || ''),
      vehicle: String(opt.vehicle || ''),
      label: String(opt.label || ''),
      price: Number(opt.price) || 0,
      isRecommended: Boolean(opt.is_recommended),
      enabled: opt.enabled !== false,
    }))

  const origin = String(transfer.origin || '')
  const destination = String(transfer.destination || '')

  return {
    origin,
    originType: parseLocationType(transfer.origin_type),
    destination,
    destinationType: parseLocationType(transfer.destination_type),
    routeLabel: `${origin} → ${destination}`,
    date: String(transfer.date || ''),
    time: String(transfer.time || ''),
    vehicleType: vehicleLabel,
    passengers: Number(transfer.passengers) || 1,
    price: Number(transfer.price) || Number(item.base_price) || 0,
    currency: String(transfer.currency || 'BRL'),
    description: transfer.description ? String(transfer.description) : null,
    notes: transfer.notes ? String(transfer.notes) : null,
    imageUrl: String(transfer.image_url || item.image_url || '') || null,
    showRoute: transfer.show_route !== false,
    showDatetime: transfer.show_datetime !== false,
    showVehicle: transfer.show_vehicle !== false,
    showPassengers: transfer.show_passengers !== false,
    options,
  }
}

/**
 * Lê formato legado (flat)
 */
function readLegacyTransferData(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): TransferViewData {
  const vehicleType = String(rc.vehicle_type || '')
  const vehicleLabel = VEHICLE_TYPE_LABELS[vehicleType] || vehicleType

  const options: TransferOptionViewData[] = (item.options || []).map(opt => ({
    id: opt.id,
    vehicle: '',
    label: opt.option_label,
    price: Number(opt.price_delta) || 0,
    isRecommended: false,
    enabled: true,
  }))

  const origin = String(rc.origin || '')
  const destination = String(rc.destination || '')

  return {
    origin,
    originType: parseLocationType(rc.origin_type),
    destination,
    destinationType: parseLocationType(rc.destination_type),
    routeLabel: `${origin} → ${destination}`,
    date: String(rc.date || ''),
    time: String(rc.time || ''),
    vehicleType: vehicleLabel,
    passengers: Number(rc.passengers) || 1,
    price: Number(rc.price) || Number(item.base_price) || 0,
    currency: String(rc.currency || 'BRL'),
    description: rc.description ? String(rc.description) : null,
    notes: rc.notes ? String(rc.notes) : null,
    imageUrl: String(rc.image_url || item.image_url || '') || null,
    showRoute: rc.show_route !== false,
    showDatetime: rc.show_datetime !== false,
    showVehicle: rc.show_vehicle !== false,
    showPassengers: rc.show_passengers !== false,
    options,
  }
}

/**
 * Parse location type
 */
function parseLocationType(value: unknown): 'airport' | 'hotel' | 'port' | 'address' {
  if (!value) return 'address'
  const str = String(value).toLowerCase()
  if (str === 'airport' || str === 'aeroporto') return 'airport'
  if (str === 'hotel') return 'hotel'
  if (str === 'port' || str === 'porto') return 'port'
  return 'address'
}

/**
 * Verifica se o item é um transfer válido
 */
export function isTransferItem(item: ProposalItemWithOptions): boolean {
  if (item.item_type === 'transfer') return true

  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.transfer || (rc?.origin && rc?.destination))
}

/**
 * Ícone para tipo de local
 */
export const LOCATION_TYPE_ICONS: Record<string, string> = {
  airport: 'Plane',
  hotel: 'Building2',
  port: 'Ship',
  address: 'MapPin',
}
