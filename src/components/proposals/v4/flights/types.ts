/**
 * Flight Types - Nova arquitetura de voos com Trechos (Legs) e Opções
 *
 * Conceito:
 * - Um item de voo contém múltiplos TRECHOS (legs)
 * - Cada trecho representa uma etapa da viagem (IDA, VOLTA, ou conexão)
 * - Cada trecho pode ter múltiplas OPÇÕES de voo
 * - O cliente escolhe UMA opção por trecho
 */

// Companhias aéreas com seus estilos visuais
export const AIRLINES = [
    { code: 'LA', name: 'LATAM', logo: '🟣', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    { code: 'G3', name: 'GOL', logo: '🟠', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { code: 'AD', name: 'Azul', logo: '🔵', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { code: 'AA', name: 'American', logo: '🔴', color: 'bg-red-100 text-red-700 border-red-200' },
    { code: 'UA', name: 'United', logo: '🔷', color: 'bg-sky-100 text-sky-700 border-sky-200' },
    { code: 'DL', name: 'Delta', logo: '🔺', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { code: 'AF', name: 'Air France', logo: '🇫🇷', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { code: 'BA', name: 'British Airways', logo: '🇬🇧', color: 'bg-red-100 text-red-700 border-red-200' },
    { code: 'IB', name: 'Iberia', logo: '🇪🇸', color: 'bg-red-100 text-red-700 border-red-200' },
    { code: 'TP', name: 'TAP', logo: '🇵🇹', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { code: 'AZ', name: 'ITA Airways', logo: '🇮🇹', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { code: 'LH', name: 'Lufthansa', logo: '🇩🇪', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { code: 'EK', name: 'Emirates', logo: '🇦🇪', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { code: 'QR', name: 'Qatar', logo: '🟤', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { code: 'OTHER', name: 'Outra', logo: '✈️', color: 'bg-slate-100 text-slate-700 border-slate-200' },
] as const

export type AirlineCode = typeof AIRLINES[number]['code']

// Classes de cabine
export const CABIN_CLASSES = [
    { value: 'economy', label: 'Econômica', short: 'Y' },
    { value: 'premium_economy', label: 'Premium Economy', short: 'W' },
    { value: 'business', label: 'Executiva', short: 'J' },
    { value: 'first', label: 'Primeira', short: 'F' },
] as const

export type CabinClass = typeof CABIN_CLASSES[number]['value']

// Famílias tarifárias (exemplos comuns)
export const FARE_FAMILIES = [
    { value: 'light', label: 'Light', baggage: 'Sem bagagem' },
    { value: 'plus', label: 'Plus', baggage: '1 mala 23kg' },
    { value: 'top', label: 'Top', baggage: '2 malas 23kg' },
    { value: 'premium', label: 'Premium', baggage: '2 malas 32kg' },
] as const

export type FareFamily = typeof FARE_FAMILIES[number]['value']

/**
 * Uma opção de voo dentro de um trecho
 * Representa uma alternativa que o cliente pode escolher
 */
export interface FlightOption {
    id: string

    // Identificação do voo
    airline_code: AirlineCode | string
    airline_name: string
    flight_number: string

    // Horários
    departure_time: string  // HH:mm
    arrival_time: string    // HH:mm

    // Classe e tarifa
    cabin_class: CabinClass | string
    fare_family: FareFamily | string

    // Detalhes
    equipment: string       // Tipo de aeronave (ex: 73G, 320, 789)
    stops: number           // 0 = direto, 1+ = com escala
    baggage: string         // Descrição da bagagem

    // Preço
    price: number
    currency: 'BRL' | 'USD' | 'EUR'

    // Extras opcionais (para precificação detalhada)
    price_delta?: number  // Custo adicional sobre preço base (upgrades)
    extras?: FlightExtras

    // Flags
    is_recommended: boolean
    enabled: boolean  // Para desativar temporariamente

    // Ordem de exibição
    ordem: number
}

/**
 * Extras de voo para precificação detalhada
 */
export interface FlightExtras {
    baggage_checked?: string     // Ex: "1x23kg"
    baggage_price?: number       // Preço adicional da bagagem
    seat_selection?: boolean     // Seleção de assento disponível
    seat_price?: number          // Preço da seleção de assento
    meal_included?: boolean      // Refeição incluída
}

/**
 * Um trecho da viagem (leg)
 * Pode ser IDA, VOLTA, ou uma conexão intermediária
 */
export interface FlightLeg {
    id: string

    // Tipo do trecho
    leg_type: 'outbound' | 'return' | 'connection'
    label: string           // Ex: "IDA", "VOLTA", "Conexão 1"

    // Rota
    origin_code: string     // Código IATA (ex: GRU)
    origin_city: string     // Nome da cidade
    destination_code: string
    destination_city: string

    // Data do trecho
    date: string            // YYYY-MM-DD

    // Opções de voo para este trecho
    options: FlightOption[]

    // Ordem de exibição
    ordem: number

    // UI state
    is_expanded: boolean
}

/**
 * Estrutura completa de voos para uma proposta
 * Armazenada em proposal_items.rich_content.flights
 */
export interface FlightsData {
    legs: FlightLeg[]

    // Configurações gerais
    show_prices: boolean        // Mostrar preços individuais ou só total
    allow_mix_airlines: boolean // Cliente pode misturar cias diferentes

    // Seleção padrão (para pré-selecionar opções)
    default_selections: Record<string, string>  // { leg_id: option_id }

    // Campos adicionais
    image_url?: string | null
    description?: string | null
    notes?: string | null
}

/**
 * Helper para criar um novo trecho vazio
 */
export function createEmptyLeg(
    legType: FlightLeg['leg_type'] = 'outbound',
    ordem: number = 0,
    previousLeg?: FlightLeg
): FlightLeg {
    const labels: Record<FlightLeg['leg_type'], string> = {
        outbound: 'IDA',
        return: 'VOLTA',
        connection: `Trecho ${ordem + 1}`
    }

    return {
        id: `leg-${Date.now()}-${ordem}`,
        leg_type: legType,
        label: labels[legType],
        origin_code: legType === 'return' && previousLeg ? previousLeg.destination_code : '',
        origin_city: legType === 'return' && previousLeg ? previousLeg.destination_city : '',
        destination_code: legType === 'return' && previousLeg ? previousLeg.origin_code : '',
        destination_city: legType === 'return' && previousLeg ? previousLeg.origin_city : '',
        date: '',
        options: [],
        ordem,
        is_expanded: true
    }
}

/**
 * Helper para criar uma nova opção de voo vazia
 */
export function createEmptyOption(ordem: number = 0): FlightOption {
    return {
        id: `opt-${Date.now()}-${ordem}`,
        airline_code: 'LA',
        airline_name: 'LATAM',
        flight_number: '',
        departure_time: '',
        arrival_time: '',
        cabin_class: 'economy',
        fare_family: 'light',
        equipment: '',
        stops: 0,
        baggage: '',
        price: 0,
        currency: 'BRL',
        is_recommended: ordem === 0,
        enabled: true,
        ordem
    }
}

/**
 * Helper para obter informações da companhia aérea
 */
export function getAirlineInfo(code: string) {
    return AIRLINES.find(a => a.code === code) || AIRLINES[AIRLINES.length - 1]
}

/**
 * Helper para obter informações da classe
 */
export function getCabinClassInfo(value: string) {
    return CABIN_CLASSES.find(c => c.value === value) || CABIN_CLASSES[0]
}

/**
 * Helper para formatar preço
 */
export function formatPrice(price: number, currency: string = 'BRL'): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency
    }).format(price)
}

/**
 * Helper para calcular duração do voo
 */
export function calculateDuration(departure: string, arrival: string): string {
    if (!departure || !arrival) return ''

    const [depH, depM] = departure.split(':').map(Number)
    const [arrH, arrM] = arrival.split(':').map(Number)

    let totalMinutes = (arrH * 60 + arrM) - (depH * 60 + depM)
    if (totalMinutes < 0) totalMinutes += 24 * 60 // Atravessa meia-noite

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
}
