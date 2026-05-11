/**
 * Insurance Editor Types
 */

export interface InsuranceData {
    name: string
    provider: string // Seguradora
    coverage_start: string
    coverage_end: string
    travelers: number
    medical_coverage: number // Valor cobertura médica (ex: 100000 USD)
    medical_coverage_currency: 'USD' | 'EUR' | 'BRL'
    price: number
    price_type: 'per_person' | 'total'
    coverages: string[] // Lista de coberturas
    policy_number?: string | null
    description?: string | null
    notes: string
    image_url?: string | null
    options: InsuranceOption[]

    // Campos condicionais
    show_coverage_dates?: boolean
    show_medical_value?: boolean
}

export interface InsuranceOption {
    id: string
    label: string
    tier: InsuranceTier
    price: number
    is_recommended: boolean
    enabled: boolean
    ordem: number
}

export type InsuranceTier = 'basic' | 'standard' | 'premium' | 'platinum'

export const INSURANCE_PROVIDERS = [
    { code: 'assist_card', name: 'Assist Card' },
    { code: 'travel_ace', name: 'Travel Ace' },
    { code: 'gta', name: 'GTA' },
    { code: 'affinity', name: 'Affinity' },
    { code: 'april', name: 'April' },
    { code: 'coris', name: 'Coris' },
    { code: 'ita', name: 'ITA' },
    { code: 'intermac', name: 'Intermac' },
    { code: 'vital_card', name: 'Vital Card' },
    { code: 'allianz', name: 'Allianz Travel' },
    { code: 'porto_seguro', name: 'Porto Seguro' },
    { code: 'other', name: 'Outra' },
]

export const INSURANCE_TIER_LABELS: Record<InsuranceTier, string> = {
    basic: 'Básico',
    standard: 'Standard',
    premium: 'Premium',
    platinum: 'Platinum',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
}

export const DEFAULT_COVERAGES = [
    'Despesas médicas e hospitalares',
    'Translado médico',
    'Regresso sanitário',
    'Cancelamento de viagem',
    'Extravio de bagagem',
    'Atraso de bagagem',
    'Assistência odontológica',
    'Assistência farmacêutica',
    'Prorrogação de estadia',
    'Retorno antecipado',
]

export function createInitialInsuranceData(): InsuranceData {
    return {
        name: '',
        provider: 'assist_card',
        coverage_start: '',
        coverage_end: '',
        travelers: 2,
        medical_coverage: 60000,
        medical_coverage_currency: 'USD',
        price: 0,
        price_type: 'per_person',
        coverages: [
            'Despesas médicas e hospitalares',
            'Translado médico',
            'Extravio de bagagem',
        ],
        policy_number: null,
        description: null,
        notes: '',
        image_url: null,
        options: [],
        show_coverage_dates: true,
        show_medical_value: true,
    }
}

export function calculateDays(startDate: string, endDate: string): number {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diff = end.getTime() - start.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
