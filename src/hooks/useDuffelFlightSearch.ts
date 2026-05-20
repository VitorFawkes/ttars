import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first'

export interface FlightSearchSlice {
    origin: string
    destination: string
    departure_date: string // YYYY-MM-DD
}

export interface FlightSearchCriteria {
    slices: FlightSearchSlice[]
    passengers: number
    cabin_class?: CabinClass
    max_connections?: number
}

export interface FlightSegment {
    origin_iata: string
    destination_iata: string
    departure_datetime: string
    arrival_datetime: string
    airline_iata: string
    airline_name: string
    flight_number: string
    aircraft?: string
    duration_minutes: number
}

export interface FlightSliceResult {
    origin: { iata_code: string; city_name?: string; airport_name?: string }
    destination: { iata_code: string; city_name?: string; airport_name?: string }
    departure_datetime: string
    arrival_datetime: string
    duration_minutes: number
    stops: number
    segments: FlightSegment[]
}

export interface FlightOffer {
    id: string
    total_amount: number
    total_currency: string
    base_amount: number
    tax_amount: number
    owner: { iata_code: string; name: string; logo_url?: string }
    slices: FlightSliceResult[]
    cabin_class: CabinClass
    baggage_summary?: string
    expires_at: string
}

interface SearchResponse {
    offers: FlightOffer[]
    request_id: string
    total: number
}

export function useDuffelFlightSearch() {
    return useMutation({
        mutationFn: async (criteria: FlightSearchCriteria): Promise<SearchResponse> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            const response = await supabase.functions.invoke('duffel-flight-search', {
                body: criteria,
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao buscar voos')
            }
            return response.data as SearchResponse
        },
        onError: (err: Error) => {
            toast.error('Erro ao buscar voos', { description: err.message })
        },
    })
}

/** Formata duração em minutos pra "5h 30min" */
export function formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '—'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
}

/** Formata horário ISO em "HH:mm" no fuso do voo */
export function formatTime(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

/** Formata data ISO em "dd 'de' mmm" */
export function formatDate(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
    })
}
