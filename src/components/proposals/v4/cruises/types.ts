/**
 * Cruise Types - Tipos para cruzeiros
 */

// Companhias de cruzeiro
export const CRUISE_LINES = [
    { code: 'MSC', name: 'MSC Cruzeiros', color: 'bg-blue-100 text-blue-700' },
    { code: 'COSTA', name: 'Costa Cruzeiros', color: 'bg-yellow-100 text-yellow-700' },
    { code: 'ROYAL', name: 'Royal Caribbean', color: 'bg-sky-100 text-sky-700' },
    { code: 'NCL', name: 'Norwegian Cruise Line', color: 'bg-indigo-100 text-indigo-700' },
    { code: 'CARNIVAL', name: 'Carnival', color: 'bg-red-100 text-red-700' },
    { code: 'PRINCESS', name: 'Princess Cruises', color: 'bg-purple-100 text-purple-700' },
    { code: 'CELEBRITY', name: 'Celebrity Cruises', color: 'bg-slate-100 text-slate-700' },
    { code: 'OTHER', name: 'Outra', color: 'bg-gray-100 text-gray-700' },
] as const

export type CruiseLineCode = typeof CRUISE_LINES[number]['code']

// Tipos de cabine
export const CABIN_TYPES = [
    { value: 'inside', label: 'Interna', description: 'Sem janela' },
    { value: 'oceanview', label: 'Vista Mar', description: 'Com janela' },
    { value: 'balcony', label: 'Varanda', description: 'Com varanda privativa' },
    { value: 'suite', label: 'Suíte', description: 'Categoria superior' },
    { value: 'haven', label: 'Haven/Yacht Club', description: 'Área exclusiva' },
] as const

export type CabinType = typeof CABIN_TYPES[number]['value']

// Regime de alimentação
export const BOARD_TYPES = {
    'all_inclusive': 'All Inclusive',
    'full_board': 'Pensão Completa',
    'drinks_included': 'Bebidas Incluídas',
    'standard': 'Padrão (refeições inclusas)',
} as const

export type BoardType = keyof typeof BOARD_TYPES

// Símbolos de moeda
export const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
}

/**
 * Opção de cabine/upgrade
 */
export interface CruiseOption {
    id: string
    cabin_type: CabinType
    label: string
    price: number
    is_recommended: boolean
    enabled: boolean
    ordem: number
}

/**
 * Porto de escala
 */
export interface CruisePort {
    id: string
    port_name: string
    country: string
    arrival_date?: string
    arrival_time?: string
    departure_time?: string
    is_embarkation?: boolean
    is_disembarkation?: boolean
}

/**
 * Dados completos do cruzeiro
 */
export interface CruiseData {
    // Identificação
    cruise_name: string
    cruise_line: CruiseLineCode | string
    ship_name: string

    // Imagem
    image_url: string | null
    images: string[]

    // Roteiro
    itinerary: string
    ports: CruisePort[]

    // Datas
    embarkation_date: string
    embarkation_port: string
    disembarkation_date: string
    disembarkation_port: string
    nights: number

    // Cabine base
    cabin_type: CabinType
    cabin_number?: string
    deck?: string

    // Regime
    board_type: BoardType

    // Preço
    price_type: 'per_person' | 'total'
    price: number
    passengers: number

    // Extras
    description: string | null
    included: string[]
    cancellation_policy: string | null
    notes: string

    // Opções de upgrade
    options: CruiseOption[]
}

/**
 * Helper para criar dados iniciais
 */
export function createInitialCruiseData(): CruiseData {
    return {
        cruise_name: '',
        cruise_line: 'MSC',
        ship_name: '',
        image_url: null,
        images: [],
        itinerary: '',
        ports: [],
        embarkation_date: '',
        embarkation_port: '',
        disembarkation_date: '',
        disembarkation_port: '',
        nights: 7,
        cabin_type: 'balcony',
        cabin_number: '',
        deck: '',
        board_type: 'full_board',
        price_type: 'per_person',
        price: 0,
        passengers: 2,
        description: null,
        included: [],
        cancellation_policy: null,
        notes: '',
        options: [],
    }
}

/**
 * Helper para calcular noites
 */
export function calculateNights(embarkation: string, disembarkation: string): number {
    if (!embarkation || !disembarkation) return 0
    const start = new Date(embarkation)
    const end = new Date(disembarkation)
    const diff = end.getTime() - start.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Helper para obter info da companhia
 */
export function getCruiseLineInfo(code: string) {
    return CRUISE_LINES.find(c => c.code === code) || CRUISE_LINES[CRUISE_LINES.length - 1]
}
