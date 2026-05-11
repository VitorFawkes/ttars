/**
 * Shared components exports
 */

// Types
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
  ItemSelection,
  SelectionsMap,
} from './types'

// Labels
export {
  INSURANCE_PROVIDER_LABELS,
  BOARD_TYPE_LABELS,
  CABIN_CLASS_LABELS,
  VEHICLE_TYPE_LABELS,
  CRUISE_LINE_LABELS,
} from './types'

// Readers
export * from './readers'

// Hooks
export { useProposalSelections } from './hooks/useProposalSelections'
export { useProposalTotals, getSelectedItemsSummary } from './hooks/useProposalTotals'
export { useProposalAccept, trackProposalView } from './hooks/useProposalAccept'

// Utils
export { formatPrice, formatPriceDelta, formatPriceWithSymbol, type Currency } from './utils/priceUtils'
export { formatDateShort, formatDateLong, formatTime, formatDateRange, formatDateWithWeekday, calculateNights, isNextDay } from './utils/dateUtils'
