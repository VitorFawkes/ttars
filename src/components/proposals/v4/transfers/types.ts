/**
 * Transfer Editor Types
 */

export interface TransferData {
    origin: string
    origin_type: LocationType
    destination: string
    destination_type: LocationType
    date: string
    time: string
    vehicle_type: VehicleType
    passengers: number
    price: number
    currency: 'BRL' | 'USD' | 'EUR'
    notes: string
    options: TransferOption[]

    // Campos adicionais
    image_url?: string | null
    description?: string | null

    // Configuração de campos visíveis (flexibilidade)
    show_route?: boolean      // Mostrar origem/destino
    show_datetime?: boolean   // Mostrar data/hora
    show_vehicle?: boolean    // Mostrar tipo de veículo
    show_passengers?: boolean // Mostrar número de passageiros
}

export type LocationType = 'airport' | 'hotel' | 'port' | 'address'
export type VehicleType = 'sedan' | 'suv' | 'van' | 'minibus' | 'bus'

export interface TransferOption {
    id: string
    vehicle: VehicleType
    label: string
    price: number
    is_recommended: boolean
    enabled: boolean  // Para desativar temporariamente
    ordem: number     // Para ordenação drag-drop
}

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
    airport: 'Aeroporto',
    hotel: 'Hotel',
    port: 'Porto',
    address: 'Endereco',
}

export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
    airport: 'plane',
    hotel: 'building',
    port: 'ship',
    address: 'map-pin',
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
    sedan: 'Sedan',
    suv: 'SUV',
    van: 'Van',
    minibus: 'Minibus',
    bus: 'Onibus',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
}

export function createInitialTransferData(): TransferData {
    return {
        origin: '',
        origin_type: 'airport',
        destination: '',
        destination_type: 'hotel',
        date: '',
        time: '',
        vehicle_type: 'sedan',
        passengers: 2,
        price: 0,
        currency: 'BRL',
        notes: '',
        options: [],
        image_url: null,
        description: null,
        // Campos visíveis por padrão
        show_route: true,
        show_datetime: true,
        show_vehicle: true,
        show_passengers: true,
    }
}
