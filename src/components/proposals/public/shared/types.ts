/**
 * Tipos compartilhados para o Public Proposal Viewer
 *
 * Cada tipo representa os dados JÁ EXTRAÍDOS do rich_content,
 * prontos para renderização nos componentes.
 */

// ============================================
// HOTEL
// ============================================

export interface HotelViewData {
  hotelName: string
  locationCity: string
  starRating: number
  roomType: string
  boardType: string
  checkInDate: string
  checkOutDate: string
  checkInTime: string
  checkOutTime: string
  nights: number
  pricePerNight: number
  totalPrice: number
  amenities: string[]
  cancellationPolicy: string
  description: string | null
  notes: string | null
  imageUrl: string | null
  images: string[]
  options: HotelOptionViewData[]
}

export interface HotelOptionViewData {
  id: string
  label: string
  priceDelta: number
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// FLIGHTS
// ============================================

export interface FlightsViewData {
  legs: FlightLegViewData[]
  showPrices: boolean
  allowMixAirlines: boolean
  totalPrice: number
}

export interface FlightLegViewData {
  id: string
  type: 'outbound' | 'return' | 'connection'
  label: string
  originCode: string
  originCity: string
  destinationCode: string
  destinationCity: string
  date: string
  selectedOption: FlightOptionViewData | null
  allOptions: FlightOptionViewData[]
}

export interface FlightOptionViewData {
  id: string
  airlineCode: string
  airlineName: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  cabinClass: string
  fareFamily: string
  equipment: string
  stops: number
  baggage: string
  price: number
  currency: string
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// EXPERIENCE
// ============================================

export interface ExperienceViewData {
  name: string
  date: string
  time: string
  duration: string
  locationCity: string
  meetingPoint: string
  participants: number
  priceType: 'per_person' | 'total'
  price: number
  totalPrice: number
  currency: string
  included: string[]
  provider: string | null
  cancellationPolicy: string | null
  ageRestriction: string | null
  difficultyLevel: 'easy' | 'moderate' | 'challenging' | null
  description: string | null
  notes: string | null
  imageUrl: string | null
  images: string[]
  options: ExperienceOptionViewData[]
}

export interface ExperienceOptionViewData {
  id: string
  label: string
  price: number
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// TRANSFER
// ============================================

export interface TransferViewData {
  origin: string
  originType: 'airport' | 'hotel' | 'port' | 'address'
  destination: string
  destinationType: 'airport' | 'hotel' | 'port' | 'address'
  routeLabel: string
  date: string
  time: string
  vehicleType: string
  passengers: number
  price: number
  currency: string
  description: string | null
  notes: string | null
  imageUrl: string | null
  showRoute: boolean
  showDatetime: boolean
  showVehicle: boolean
  showPassengers: boolean
  options: TransferOptionViewData[]
}

export interface TransferOptionViewData {
  id: string
  vehicle: string
  label: string
  price: number
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// INSURANCE
// ============================================

export interface InsuranceViewData {
  name: string
  provider: string
  providerLabel: string
  coverageStart: string
  coverageEnd: string
  travelers: number
  medicalCoverage: number
  medicalCoverageCurrency: string
  price: number
  priceType: 'per_person' | 'total'
  totalPrice: number
  coverages: string[]
  policyNumber: string | null
  description: string | null
  notes: string | null
  imageUrl: string | null
  showCoverageDates: boolean
  showMedicalValue: boolean
  options: InsuranceOptionViewData[]
}

export interface InsuranceOptionViewData {
  id: string
  label: string
  tier: 'basic' | 'standard' | 'premium' | 'platinum'
  price: number
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// CRUISE
// ============================================

export interface CruiseViewData {
  cruiseName: string
  cruiseLine: string
  shipName: string
  itinerary: string
  ports: CruisePortViewData[]
  embarkationDate: string
  embarkationPort: string
  disembarkationDate: string
  disembarkationPort: string
  nights: number
  cabinType: string
  cabinNumber: string | null
  deck: string | null
  boardType: string
  priceType: 'per_person' | 'total'
  price: number
  passengers: number
  totalPrice: number
  description: string | null
  included: string[]
  cancellationPolicy: string | null
  notes: string | null
  imageUrl: string | null
  images: string[]
  options: CruiseOptionViewData[]
}

export interface CruisePortViewData {
  id: string
  portName: string
  country: string
  arrivalDate: string | null
  arrivalTime: string | null
  departureTime: string | null
  isEmbarkation: boolean
  isDisembarkation: boolean
}

export interface CruiseOptionViewData {
  id: string
  cabinType: string
  label: string
  price: number
  isRecommended: boolean
  enabled: boolean
}

// ============================================
// SELECTION STATE
// ============================================

export interface ItemSelection {
  selected: boolean
  optionId?: string
  quantity?: number
}

export type SelectionsMap = Record<string, ItemSelection>

// ============================================
// PROVIDER LABELS
// ============================================

export const INSURANCE_PROVIDER_LABELS: Record<string, string> = {
  assist_card: 'Assist Card',
  travel_ace: 'Travel Ace',
  gta: 'GTA',
  affinity: 'Affinity',
  april: 'April',
  coris: 'Coris',
  ita: 'ITA',
  intermac: 'Intermac',
  vital_card: 'Vital Card',
  allianz: 'Allianz',
  porto_seguro: 'Porto Seguro',
  other: 'Outro',
}

export const BOARD_TYPE_LABELS: Record<string, string> = {
  room_only: 'Somente hospedagem',
  breakfast: 'Café da manhã',
  half_board: 'Meia pensão',
  full_board: 'Pensão completa',
  all_inclusive: 'All Inclusive',
}

export const CABIN_CLASS_LABELS: Record<string, string> = {
  economy: 'Econômica',
  premium_economy: 'Econômica Premium',
  business: 'Executiva',
  first: 'Primeira Classe',
}

export const VEHICLE_TYPE_LABELS: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  van: 'Van',
  minibus: 'Minibus',
  bus: 'Ônibus',
}

export const CRUISE_LINE_LABELS: Record<string, string> = {
  MSC: 'MSC Cruzeiros',
  COSTA: 'Costa Cruzeiros',
  ROYAL: 'Royal Caribbean',
  NCL: 'Norwegian Cruise Line',
  CARNIVAL: 'Carnival',
  PRINCESS: 'Princess Cruises',
  CELEBRITY: 'Celebrity Cruises',
  OTHER: 'Outro',
}
