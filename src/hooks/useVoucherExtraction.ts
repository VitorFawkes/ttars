/**
 * useVoucherExtraction — Hook para extrair dados de vouchers via IA.
 *
 * Reutiliza a edge function ai-extract-image (OpenAI GPT Vision) que já existe.
 * Aceita qualquer formato: foto do celular (JPEG/PNG), screenshot, PDF, URL.
 *
 * Workflow:
 * 1. Operador faz upload do arquivo
 * 2. Hook converte para base64 e envia para edge function
 * 3. IA extrai dados estruturados (hotel, voo, transfer, etc)
 * 4. Operador confirma/edita os dados extraídos
 */

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export type VoucherType = 'hotel' | 'flight' | 'transfer' | 'experience' | 'generic'

export interface VoucherExtractionResult {
    success: boolean
    voucher_type: VoucherType
    confidence: number
    extracted_data: Record<string, unknown>
    error?: string
}

// Prompts especializados por tipo de voucher
const VOUCHER_PROMPTS: Record<VoucherType, string> = {
    hotel: `Extraia os dados deste voucher/confirmação de HOTEL:
- hotel_name: nome do hotel
- check_in: data check-in (YYYY-MM-DD)
- check_out: data check-out (YYYY-MM-DD)
- nights: número de noites
- room_type: tipo do quarto
- board_type: regime (café da manhã, all-inclusive, etc)
- confirmation_number: número de confirmação/reserva
- guest_names: nomes dos hóspedes (array)
- rate_per_night: valor por noite
- total_rate: valor total
- currency: moeda (BRL, USD, EUR)
- address: endereço do hotel
- phone: telefone do hotel
- notes: observações relevantes`,

    flight: `Extraia os dados deste e-ticket/voucher de VOO:
- pnr: código localizador (PNR)
- airline_code: código IATA da companhia (ex: LA, G3, AD)
- airline_name: nome da companhia
- segments: array de trechos, cada um com:
  - flight_number, departure_airport, departure_city, departure_date, departure_time,
    arrival_airport, arrival_city, arrival_date, arrival_time,
    cabin_class, seat, baggage, ticket_number
- passengers: nomes dos passageiros (array)
- total_fare: valor total
- currency: moeda`,

    transfer: `Extraia os dados deste voucher de TRANSFER:
- origin: local de partida
- destination: local de chegada
- date: data (YYYY-MM-DD)
- time: horário
- vehicle_type: tipo do veículo
- driver_name: nome do motorista (se disponível)
- confirmation_number: número de confirmação
- passengers: número de passageiros
- notes: observações (ex: placa do carro, ponto de encontro)`,

    experience: `Extraia os dados deste voucher/ingresso de EXPERIÊNCIA/PASSEIO:
- experience_name: nome do passeio/atração
- date: data (YYYY-MM-DD)
- time: horário
- location: local
- quantity: número de participantes
- confirmation_number: número de confirmação
- provider: operador/fornecedor
- notes: observações relevantes
- total_price: valor total
- currency: moeda`,

    generic: `Extraia TODOS os dados relevantes deste documento de viagem.
Identifique o tipo (hotel, voo, transfer, experiência, seguro, outro) e extraia
os campos relevantes em formato JSON estruturado.`,
}

/**
 * Extrai dados de um voucher usando IA (OpenAI GPT Vision).
 * Aceita imagem (File) ou URL.
 */
export function useVoucherExtraction() {
    return useMutation({
        mutationFn: async ({
            file,
            imageUrl,
            voucherType,
            tripPlanId,
        }: {
            file?: File
            imageUrl?: string
            voucherType: VoucherType
            tripPlanId: string
        }): Promise<VoucherExtractionResult> => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) throw new Error('Não autenticado')

            // Converter arquivo para base64 se for file
            let image: string | undefined
            if (file) {
                image = await fileToBase64(file)
            }

            if (!image && !imageUrl) {
                throw new Error('Arquivo ou URL é obrigatório')
            }

            // Chamar edge function existente com prompt de voucher
            const response = await supabase.functions.invoke('ai-extract-image', {
                body: {
                    image,
                    imageUrl,
                    // Usar campo custom para prompt de voucher
                    voucherExtraction: true,
                    voucherType,
                    voucherPrompt: VOUCHER_PROMPTS[voucherType],
                },
            })

            if (response.error) {
                throw new Error(response.error.message || 'Erro ao processar voucher')
            }

            const result = response.data

            // Salvar extração no log (fire-and-forget)
            if (tripPlanId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(supabase.from as any)('voucher_extractions').insert({
                    trip_plan_id: tripPlanId,
                    file_url: imageUrl || 'upload-base64',
                    file_name: file?.name || 'url',
                    voucher_type: voucherType,
                    extracted_data: result?.items?.[0]?.details || result,
                    confidence: result?.confidence || 0,
                    extraction_error: result?.error || null,
                }).then(() => {})
            }

            // Mapear resposta para formato de voucher
            const firstItem = result?.items?.[0]
            return {
                success: !!result?.success && !!firstItem,
                voucher_type: voucherType,
                confidence: result?.confidence || 0,
                extracted_data: firstItem?.details || {},
                error: result?.error,
            }
        },
        onError: (error: Error) => {
            toast.error('Erro ao extrair dados do voucher', {
                description: error.message,
            })
        },
    })
}

// Helper: File → base64
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            const base64 = result.split(',')[1]
            resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}
