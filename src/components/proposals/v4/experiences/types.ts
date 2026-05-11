/**
 * Experience Editor Types
 */

export interface ExperienceData {
    name: string
    date: string
    time: string
    duration: string
    location_city: string
    meeting_point: string
    participants: number
    price_type: 'per_person' | 'total'
    price: number
    currency: 'BRL' | 'USD' | 'EUR'
    included: string[]
    options: ExperienceOption[]

    // Campos adicionais
    provider?: string | null        // Quem organiza (ex: GetYourGuide)
    cancellation_policy?: string | null
    age_restriction?: string | null  // Ex: "Maiores de 18 anos"
    difficulty_level?: DifficultyLevel | null
    image_url?: string | null
    description?: string | null
    notes?: string | null
}

export type DifficultyLevel = 'easy' | 'moderate' | 'challenging'

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
    easy: 'Fácil',
    moderate: 'Moderado',
    challenging: 'Desafiador',
}

export interface ExperienceOption {
    id: string
    label: string
    price: number
    is_recommended: boolean
    enabled: boolean  // Para desativar temporariamente
    ordem: number     // Para ordenação drag-drop
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
}

export function createInitialExperienceData(): ExperienceData {
    return {
        name: '',
        date: '',
        time: '',
        duration: '',
        location_city: '',
        meeting_point: '',
        participants: 2,
        price_type: 'per_person',
        price: 0,
        currency: 'BRL',
        included: [],
        options: [],
        provider: null,
        cancellation_policy: null,
        age_restriction: null,
        difficulty_level: null,
        image_url: null,
        description: null,
        notes: null,
    }
}
