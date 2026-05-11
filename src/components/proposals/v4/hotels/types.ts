/**
 * Hotel Editor Types
 */

export interface HotelData {
    hotel_name: string
    star_rating: 1 | 2 | 3 | 4 | 5
    location_city: string
    room_type: string
    board_type: BoardType
    check_in_date: string   // YYYY-MM-DD
    check_out_date: string  // YYYY-MM-DD
    check_in_time?: string  // HH:mm
    check_out_time?: string // HH:mm
    nights: number
    price_per_night: number
    currency: 'BRL' | 'USD' | 'EUR'
    cancellation_policy: string
    amenities: string[]
    options: HotelOption[]  // Room upgrades

    // Campos adicionais
    image_url?: string | null
    images?: string[]  // Galeria de imagens (multiplas fotos)
    description?: string | null
    notes?: string | null
}

export type BoardType = 'room_only' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive'

export interface HotelOption {
    id: string
    label: string  // e.g., "Suite", "Vista Mar"
    price_delta: number
    is_recommended: boolean
    enabled: boolean  // Para desativar temporariamente
    ordem: number     // Para ordenação drag-drop
}

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
    room_only: 'Somente Quarto',
    breakfast: 'Cafe da Manha',
    half_board: 'Meia Pensao',
    full_board: 'Pensao Completa',
    all_inclusive: 'All Inclusive',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
}

export function createInitialHotelData(): HotelData {
    return {
        hotel_name: '',
        star_rating: 4,
        location_city: '',
        room_type: 'Standard',
        board_type: 'breakfast',
        check_in_date: '',
        check_out_date: '',
        check_in_time: '14:00',
        check_out_time: '12:00',
        nights: 1,
        price_per_night: 0,
        currency: 'BRL',
        cancellation_policy: '',
        amenities: [],
        options: [],
        image_url: null,
        images: [],
        description: null,
        notes: null,
    }
}

export function calculateNights(checkIn: string, checkOut: string): number {
    if (!checkIn || !checkOut) return 0
    const start = new Date(checkIn)
    const end = new Date(checkOut)
    const diff = end.getTime() - start.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
