/**
 * Readers - Exportação centralizada
 *
 * Cada reader sabe ler o formato namespaced do Builder V4
 * e retorna dados tipados prontos para renderização.
 */

export { readHotelData, isHotelItem } from './readHotelData'
export { readFlightData, isFlightItem, calculateLegDuration } from './readFlightData'
export { readExperienceData, isExperienceItem, DIFFICULTY_LABELS } from './readExperienceData'
export { readTransferData, isTransferItem, LOCATION_TYPE_ICONS } from './readTransferData'
export { readInsuranceData, isInsuranceItem, TIER_COLORS, TIER_LABELS } from './readInsuranceData'
export { readCruiseData, isCruiseItem, CABIN_TYPE_LABELS, CRUISE_BOARD_TYPE_LABELS } from './readCruiseData'

// Re-export types
export type {
  HotelViewData,
  HotelOptionViewData,
  FlightsViewData,
  FlightLegViewData,
  FlightOptionViewData,
  ExperienceViewData,
  ExperienceOptionViewData,
  TransferViewData,
  TransferOptionViewData,
  InsuranceViewData,
  InsuranceOptionViewData,
  CruiseViewData,
  CruisePortViewData,
  CruiseOptionViewData,
} from '../types'
