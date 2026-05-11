/**
 * Utility functions for proposal public viewer components
 * Centralized to avoid duplication across 12+ files
 */

/**
 * Format a number or string as currency
 * @param value - The value to format
 * @param currency - Currency code (default: 'BRL')
 * @returns Formatted price string
 */
export const formatPrice = (value: number | string, currency: string = 'BRL'): string => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
    }).format(Number(value) || 0)
}

/**
 * Format a date string
 * @param dateStr - ISO date string or date string
 * @param format - 'short' (12 jan) or 'long' (12 de janeiro de 2025)
 * @returns Formatted date string or null if invalid
 */
export const formatDate = (dateStr?: string, format: 'short' | 'long' = 'short'): string | null => {
    if (!dateStr) return null
    try {
        const options: Intl.DateTimeFormatOptions = format === 'short'
            ? { day: '2-digit', month: 'short' }
            : { day: '2-digit', month: 'long', year: 'numeric' }
        return new Date(dateStr).toLocaleDateString('pt-BR', options)
    } catch {
        return dateStr
    }
}

/**
 * Format a date range (e.g., "12 jan - 15 jan")
 * @param startDate - Start date string
 * @param endDate - End date string
 * @returns Formatted date range string
 */
export const formatDateRange = (startDate?: string, endDate?: string): string | null => {
    const start = formatDate(startDate)
    const end = formatDate(endDate)
    if (!start && !end) return null
    if (!end) return start
    if (!start) return end
    return `${start} - ${end}`
}

/**
 * Calculate number of nights between two dates
 * @param checkIn - Check-in date string
 * @param checkOut - Check-out date string
 * @returns Number of nights
 */
export const calculateNights = (checkIn?: string, checkOut?: string): number => {
    if (!checkIn || !checkOut) return 1
    try {
        const start = new Date(checkIn)
        const end = new Date(checkOut)
        const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        return diff > 0 ? diff : 1
    } catch {
        return 1
    }
}
