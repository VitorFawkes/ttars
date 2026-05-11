import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Dados de voo retornados pelo enrich-flight (AeroDataBox via RapidAPI).
 * Campos alinhados com FlightDetails em providers/types.ts.
 */
export interface FlightLookupResult {
    flightNumber: string
    departureDate: string
    airline: {
        iata: string
        name: string
        logoUrl?: string
    }
    departure: AirportPoint
    arrival: AirportPoint
    durationMinutes?: number
    aircraft?: string
    status?: string
    provider: string
    fetchedAt: string
}

export interface AirportPoint {
    iata: string
    name?: string
    city?: string
    country?: string
    scheduledTime?: string
    terminal?: string
    gate?: string
}

/**
 * Lookup de voo já fechado por número + data de partida.
 * Operador digita "LA8084" + seleciona data → retorna dados do voo.
 *
 * Retorna `null` quando o voo não é encontrado (sem throw).
 */
export function useFlightLookup() {
    return useMutation({
        mutationFn: async ({
            flightNumber,
            departureDate,
        }: {
            flightNumber: string
            departureDate: string
        }): Promise<FlightLookupResult | null> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            const response = await supabase.functions.invoke('enrich-flight', {
                body: {
                    flight_number: flightNumber.trim().toUpperCase(),
                    departure_date: departureDate,
                },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao buscar voo')
            }

            // Edge function retorna { details: FlightLookupResult | null }
            return (response.data?.details ?? null) as FlightLookupResult | null
        },
        onSuccess: (data) => {
            if (!data) {
                toast.info('Voo não encontrado', {
                    description: 'Verifique o número do voo e a data de partida.',
                })
            }
        },
        onError: (error: Error) => {
            toast.error('Erro ao buscar dados do voo', {
                description: error.message,
            })
        },
    })
}

/**
 * Gera URL de logo da companhia aérea a partir do código IATA.
 * Usa o serviço público AirHex (gratuito, sem API key).
 */
export function getAirlineLogoUrl(iataCode: string, size: 'small' | 'medium' = 'medium'): string {
    const dim = size === 'small' ? '70_25' : '200_60'
    return `https://content.airhex.com/content/logos/airlines_${iataCode.toUpperCase()}_${dim}_r.png`
}
