/**
 * Tipos para integração Iterpec/Cangooroo.
 * Usados pelo hook useIterpecSearch e pelos CatalogPickers.
 */

export type IterpecServiceMode = 'hotel' | 'transfer' | 'tour' | 'car'

// ─── Normalized search results (returned by Edge Function) ──────────────────

export interface IterpecPrice {
  currency: string
  value: number
}

export interface IterpecCancellationPolicy {
  StartDate: string
  EndDate: string
  Value: IterpecPrice
}

// Hotel
export interface IterpecHotelRoom {
  roomId: number
  description: string
  board: string
  hasBreakfast: boolean
  isNonRefundable: boolean
  price: IterpecPrice
  pricePerRoom: IterpecPrice
  cancellationPolicies: IterpecCancellationPolicy[]
}

export interface IterpecHotelResult {
  provider: 'iterpec_cangooroo'
  externalId: string
  iterpecHotelId: number
  name: string
  address: string
  starRating?: number
  lat: number
  lng: number
  rooms: IterpecHotelRoom[]
  cheapestPrice?: IterpecPrice
}

// Transfer
export interface IterpecTransferResult {
  provider: 'iterpec_cangooroo'
  externalId: string
  iterpecTransferId: number
  name: string
  transferType: string
  vehicleType: string
  maxPassengers: number
  price: IterpecPrice
  supplierName?: string
  description?: string
  cancellationPolicies: IterpecCancellationPolicy[]
}

// Tour
export interface IterpecTourResult {
  provider: 'iterpec_cangooroo'
  externalId: string
  iterpecTourId: number
  name: string
  description?: string
  duration?: string
  price: IterpecPrice
  supplierName?: string
  availableDates: string[]
  cancellationPolicies: IterpecCancellationPolicy[]
}

// Car
export interface IterpecCarRental {
  name: string
  logoUrl?: string
  sippCode?: string
}

export interface IterpecCarResult {
  provider: 'iterpec_cangooroo'
  externalId: string
  iterpecCarId: number
  model: string
  category: string
  transmission: string
  airConditioning: boolean
  passengers: number
  baggage: number
  doors: number
  isAvailable: boolean
  imageUrl?: string
  price: IterpecPrice
  rental: IterpecCarRental
  pickup?: { Address: string; Latitude?: string; Longitude?: string }
  dropoff?: { Address: string; Latitude?: string; Longitude?: string }
  features?: string
  cancellationPolicies: IterpecCancellationPolicy[]
}

// Union type for all results
export type IterpecSearchResult =
  | IterpecHotelResult
  | IterpecTransferResult
  | IterpecTourResult
  | IterpecCarResult

// ─── Search response (from Edge Function) ───────────────────────────────────

export interface IterpecSearchResponse<T = IterpecSearchResult> {
  results: T[]
  token: string
  tokenExpires: string
  totalTime: number
  fromCache: boolean
}

// ─── Search criteria (sent to Edge Function) ────────────────────────────────

export interface IterpecHotelCriteria {
  CheckinDate: string
  NumNights: number
  DestinationId: string
  SearchRooms: Array<{ NumAdults: number; ChildAges?: number[]; Quantity: number }>
  MainPaxCountryCodeNationality?: string
  Currency?: string
}

export interface IterpecTransferCriteria {
  Pickup: { LocationCode: number; LocationType: string }
  Dropoff: { LocationCode: number; LocationType: string }
  ServiceDate: string
  Hour: number
  Minutes: number
  ServiceDateBack?: string
  HourBack?: number
  MinutesBack?: number
  NumberOfAdults: number
  ChildrenAges?: number[]
}

export interface IterpecTourCriteria {
  CityId: string
  InitialServiceDate: string
  FinalServiceDate: string
  NumberOfDays?: number
  AdultAges?: number[]
  ChildAges?: number[]
}

export interface IterpecCarCriteria {
  Pickup: { Date: string; Hour: number; Minutes: number; LocationCode: string; LocationType: string }
  Dropoff: { Date: string; Hour: number; Minutes: number; LocationCode: string; LocationType: string }
  SippCodes?: string[]
}

export type IterpecCriteria =
  | IterpecHotelCriteria
  | IterpecTransferCriteria
  | IterpecTourCriteria
  | IterpecCarCriteria

// ─── rich_content metadata (stored in proposal_items) ───────────────────────

export interface IterpecMeta {
  provider: 'iterpec_cangooroo'
  token: string
  tokenExpires: string
}

export interface IterpecHotelItemMeta extends IterpecMeta {
  iterpecHotelId: number
  selectedRoomIds: number[]
}

export interface IterpecTransferItemMeta extends IterpecMeta {
  iterpecTransferId: number
}

export interface IterpecTourItemMeta extends IterpecMeta {
  iterpecTourId: number
}

export interface IterpecCarItemMeta extends IterpecMeta {
  iterpecCarId: number
  sippCode?: string
}
