import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// Modos de extração de voos
export type ExtractionMode = 'ida_volta' | 'ida_only' | 'volta_only' | 'separate_legs'

// Segmento de voo extraído pela IA
export interface ExtractedFlightSegment {
    segment_order: number
    airline_code: string
    airline_name: string
    flight_number: string
    departure_date: string
    departure_time: string
    departure_airport: string
    departure_city: string
    arrival_date: string
    arrival_time: string
    arrival_airport: string
    arrival_city: string
    cabin_class?: string
    baggage_included?: string
    price?: number
}

// Resultado da extração de voos
export interface FlightExtractionResult {
    success: boolean
    segments: ExtractedFlightSegment[]
    rawText?: string
    confidence?: number
    error?: string
}

export interface ExtractedItem {
    title: string
    description?: string
    price?: number
    currency?: string
    dates?: string
    location?: string
    category?: 'hotel' | 'flight' | 'transfer' | 'experience' | 'service' | 'insurance' | 'custom'
    details?: Record<string, unknown>
}

export interface ExtractionResult {
    success: boolean
    items: ExtractedItem[]
    rawText?: string
    confidence?: number
    suggestedCategory?: string
    error?: string
    details?: string
}

export function useAIExtractImage() {
    return useMutation({
        mutationFn: async ({
            image,
            imageUrl,
        }: {
            image?: string // base64
            imageUrl?: string
        }): Promise<ExtractionResult> => {
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                throw new Error('Usuário não autenticado')
            }

            const response = await supabase.functions.invoke('ai-extract-image', {
                body: { image, imageUrl },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao processar imagem')
            }

            return response.data as ExtractionResult
        },
        onError: (error: Error) => {
            toast.error('Erro ao extrair dados da imagem', {
                description: error.message,
            })
        },
    })
}

/**
 * Hook especializado para extração de voos com modo de agrupamento
 */
export function useAIExtractFlights() {
    return useMutation({
        mutationFn: async ({
            image,
            imageUrl,
            extractionMode,
        }: {
            image?: string // base64
            imageUrl?: string
            extractionMode: ExtractionMode
        }): Promise<FlightExtractionResult> => {
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                throw new Error('Usuário não autenticado')
            }

            const response = await supabase.functions.invoke('ai-extract-image', {
                body: {
                    image,
                    imageUrl,
                    extractionMode, // Passar o modo para a Edge Function
                    flightExtraction: true, // Flag para ativar extração especializada de voos
                },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao processar imagem')
            }

            // Converter resposta para FlightExtractionResult
            const data = response.data as ExtractionResult

            if (!data.success) {
                return {
                    success: false,
                    segments: [],
                    error: data.error,
                }
            }

            // Extrair segments dos items
            const flightItem = data.items?.find(
                item => item.category === 'flight' && item.details?.segments
            )

            if (flightItem?.details?.segments) {
                return {
                    success: true,
                    segments: flightItem.details.segments as ExtractedFlightSegment[],
                    rawText: data.rawText,
                    confidence: data.confidence,
                }
            }

            // Fallback: converter items genéricos em segments
            const segments: ExtractedFlightSegment[] = (data.items || [])
                .filter(item => item.category === 'flight')
                .map((item, index) => ({
                    segment_order: index + 1,
                    airline_code: (item.details?.airline_code as string) || 'OTHER',
                    airline_name: (item.details?.airline_name as string) || item.title || '',
                    flight_number: (item.details?.flight_number as string) || '',
                    departure_date: (item.details?.departure_date as string) || '',
                    departure_time: (item.details?.departure_time as string) || '',
                    departure_airport: (item.details?.departure_airport as string) || '',
                    departure_city: (item.details?.departure_city as string) || item.location || '',
                    arrival_date: (item.details?.arrival_date as string) || '',
                    arrival_time: (item.details?.arrival_time as string) || '',
                    arrival_airport: (item.details?.arrival_airport as string) || '',
                    arrival_city: (item.details?.arrival_city as string) || '',
                    cabin_class: (item.details?.cabin_class as string) || 'Economy',
                    baggage_included: (item.details?.baggage_included as string) || '',
                    price: item.price,
                }))

            return {
                success: segments.length > 0,
                segments,
                rawText: data.rawText,
                confidence: data.confidence,
            }
        },
        onError: (error: Error) => {
            toast.error('Erro ao extrair voos da imagem', {
                description: error.message,
            })
        },
    })
}

// Helper to convert File to base64
export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            // Remove the data:image/xxx;base64, prefix
            const base64 = result.split(',')[1]
            resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

// Map extracted category to proposal item type
export function mapCategoryToItemType(category?: string): string {
    const mapping: Record<string, string> = {
        hotel: 'hotel',
        flight: 'flight',
        transfer: 'transfer',
        experience: 'experience',
        service: 'service',
        insurance: 'insurance',
        custom: 'custom',
    }
    return mapping[category || ''] || 'custom'
}
