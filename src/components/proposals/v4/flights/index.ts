/**
 * Flight Components - Nova arquitetura de voos
 *
 * Exporta todos os componentes relacionados a voos no builder
 */

// Types
export * from './types'

// NEW: Simple Flight Editor (use this!)
export { FlightEditor } from './FlightEditor'

// AI Image Extraction (only for flights)
export { FlightImageExtractor } from './FlightImageExtractor'

// Legacy components (deprecated)
export { FlightOptionRow } from './FlightOptionRow'
export { FlightLegCard } from './FlightLegCard'
export { FlightLegsEditor } from './FlightLegsEditor'

// Default export - new simple editor
export { FlightEditor as default } from './FlightEditor'
