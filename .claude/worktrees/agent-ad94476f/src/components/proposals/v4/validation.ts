/**
 * Validation - Funções de validação para os editores de proposta
 *
 * Cada função retorna um objeto ValidationResult com:
 * - isValid: boolean - se os dados passam na validação
 * - errors: string[] - erros que impedem o uso
 * - warnings: string[] - avisos que não impedem, mas alertam
 */

import type { HotelData } from './hotels/types'
import type { ExperienceData } from './experiences/types'
import type { TransferData } from './transfers/types'
import type { FlightsData } from './flights/types'

export interface ValidationResult {
    isValid: boolean
    errors: string[]
    warnings: string[]
}

/**
 * Valida dados de hotel
 */
export function validateHotel(data: HotelData | null): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data) {
        return { isValid: false, errors: ['Dados do hotel não encontrados'], warnings: [] }
    }

    // Campos obrigatórios
    if (!data.location_city?.trim()) {
        errors.push('Cidade é obrigatória')
    }
    if (!data.check_in_date) {
        errors.push('Data de check-in é obrigatória')
    }
    if (!data.check_out_date) {
        errors.push('Data de check-out é obrigatória')
    }

    // Validação de datas
    if (data.check_in_date && data.check_out_date) {
        const checkIn = new Date(data.check_in_date)
        const checkOut = new Date(data.check_out_date)
        if (checkOut <= checkIn) {
            errors.push('Check-out deve ser após check-in')
        }
    }

    // Avisos (não bloqueantes)
    if (!data.price_per_night || data.price_per_night === 0) {
        warnings.push('Preço por noite está zerado')
    }
    if (!data.hotel_name?.trim()) {
        warnings.push('Nome do hotel não preenchido')
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Valida dados de experiência
 */
export function validateExperience(data: ExperienceData | null): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data) {
        return { isValid: false, errors: ['Dados da experiência não encontrados'], warnings: [] }
    }

    // Campos obrigatórios
    if (!data.date) {
        errors.push('Data é obrigatória')
    }
    if (!data.location_city?.trim()) {
        errors.push('Local é obrigatório')
    }

    // Avisos
    if (!data.price || data.price === 0) {
        warnings.push('Preço está zerado')
    }
    if (!data.name?.trim()) {
        warnings.push('Nome da experiência não preenchido')
    }
    if (data.participants < 1) {
        warnings.push('Número de participantes inválido')
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Valida dados de transfer
 */
export function validateTransfer(data: TransferData | null): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data) {
        return { isValid: false, errors: ['Dados do transfer não encontrados'], warnings: [] }
    }

    // Campos obrigatórios
    if (!data.origin?.trim()) {
        errors.push('Origem é obrigatória')
    }
    if (!data.destination?.trim()) {
        errors.push('Destino é obrigatório')
    }
    if (!data.date) {
        errors.push('Data é obrigatória')
    }

    // Avisos
    if (!data.price || data.price === 0) {
        warnings.push('Preço está zerado')
    }
    if (!data.time) {
        warnings.push('Horário não definido')
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}

/**
 * Valida dados de voo
 */
export function validateFlight(data: FlightsData | null): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!data) {
        return { isValid: false, errors: ['Dados do voo não encontrados'], warnings: [] }
    }

    // Precisa ter pelo menos um trecho
    if (!data.legs || data.legs.length === 0) {
        errors.push('Adicione pelo menos um trecho de voo')
        return { isValid: false, errors, warnings }
    }

    // Validar cada trecho
    data.legs.forEach((leg, index) => {
        const legNum = index + 1
        const legLabel = leg.label || `Trecho ${legNum}`

        if (!leg.origin_code?.trim()) {
            errors.push(`${legLabel}: Código de origem é obrigatório`)
        }
        if (!leg.destination_code?.trim()) {
            errors.push(`${legLabel}: Código de destino é obrigatório`)
        }
        if (!leg.date) {
            errors.push(`${legLabel}: Data é obrigatória`)
        }

        // Avisos para opções
        if (!leg.options || leg.options.length === 0) {
            warnings.push(`${legLabel}: Nenhuma opção de voo adicionada`)
        } else {
            const hasRecommended = leg.options.some(opt => opt.is_recommended)
            if (!hasRecommended) {
                warnings.push(`${legLabel}: Nenhuma opção marcada como recomendada`)
            }

            leg.options.forEach((opt, optIndex) => {
                if (!opt.price || opt.price === 0) {
                    warnings.push(`${legLabel} - Opção ${optIndex + 1}: Preço está zerado`)
                }
            })
        }
    })

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    }
}
