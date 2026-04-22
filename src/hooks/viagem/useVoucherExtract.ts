import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export type VoucherType = 'hotel' | 'flight' | 'transfer' | 'experience' | 'generic'

const PROMPT: Record<VoucherType, string> = {
  hotel: `Extraia os dados deste voucher/confirmação de HOTEL:
- hotel_name, check_in (YYYY-MM-DD), check_out (YYYY-MM-DD), nights, room_type,
  board_type, confirmation_number, guest_names[], rate_per_night, total_rate,
  currency (BRL/USD/EUR), address, phone, notes`,
  flight: `Extraia os dados deste e-ticket/voucher de VOO:
- pnr, airline_code, airline_name,
- segments[]: flight_number, departure_airport, departure_city, departure_date,
  departure_time, arrival_airport, arrival_city, arrival_date, arrival_time,
  cabin_class, seat, baggage, ticket_number
- passengers[], total_fare, currency`,
  transfer: `Extraia os dados deste voucher de TRANSFER:
- origin, destination, date (YYYY-MM-DD), time, vehicle_type, driver_name,
  confirmation_number, passengers, notes`,
  experience: `Extraia os dados deste voucher/ingresso de EXPERIÊNCIA/PASSEIO:
- experience_name, date (YYYY-MM-DD), time, location, quantity,
  confirmation_number, provider, notes, total_price, currency`,
  generic: `Identifique o tipo (hotel/voo/transfer/experiência/seguro/outro) e
extraia TODOS os dados relevantes em JSON estruturado.`,
}

export interface ExtractionResult {
  success: boolean
  confidence: number
  voucher_type: VoucherType
  extracted: Record<string, unknown>
  error?: string
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useTripVoucherExtract() {
  return useMutation({
    mutationFn: async ({
      file,
      voucherType,
    }: {
      file: File
      voucherType: VoucherType
    }): Promise<ExtractionResult> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const image = await fileToBase64(file)

      const response = await supabase.functions.invoke('ai-extract-image', {
        body: {
          image,
          voucherExtraction: true,
          voucherType,
          voucherPrompt: PROMPT[voucherType],
        },
      })

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao processar voucher')
      }

      const data = response.data as {
        success?: boolean
        confidence?: number
        error?: string
        items?: { details?: Record<string, unknown> }[]
      }
      const first = data?.items?.[0]
      return {
        success: !!data?.success && !!first,
        confidence: data?.confidence ?? 0,
        voucher_type: voucherType,
        extracted: first?.details ?? {},
        error: data?.error,
      }
    },
    onError: (err: Error) => {
      toast.error('Erro ao extrair voucher', { description: err.message })
    },
  })
}

/**
 * Mapeia dados extraídos da IA para o schema `operacional` dos trip_items.
 * Acomoda os vários formatos de resposta da IA (hotel/voo/transfer/experiência).
 */
export function voucherToOperacional(
  voucherType: VoucherType,
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => {
    if (v != null && v !== '') patch[k] = v
  }

  if (voucherType === 'hotel') {
    set('fornecedor', extracted.hotel_name)
    set('numero_reserva', extracted.confirmation_number)
    set('data_inicio', extracted.check_in)
    set('data_fim', extracted.check_out)
    set('endereco', extracted.address)
    set('telefone', extracted.phone)
    const notes: string[] = []
    if (extracted.board_type) notes.push(`Regime: ${extracted.board_type}`)
    if (extracted.room_type) notes.push(`Quarto: ${extracted.room_type}`)
    if (extracted.notes) notes.push(String(extracted.notes))
    if (notes.length) set('observacoes', notes.join(' · '))
  } else if (voucherType === 'flight') {
    set('fornecedor', extracted.airline_name)
    set('numero_reserva', extracted.pnr)
    const segs = Array.isArray(extracted.segments) ? (extracted.segments as Record<string, unknown>[]) : []
    if (segs.length > 0) {
      set('data_inicio', segs[0].departure_date)
      set('data_fim', segs[segs.length - 1].arrival_date)
      const legs = segs.map((s) =>
        `${s.flight_number ?? ''} ${s.departure_airport ?? ''}→${s.arrival_airport ?? ''}`.trim(),
      )
      set('observacoes', legs.join(' · '))
    }
  } else if (voucherType === 'transfer') {
    set('fornecedor', extracted.provider ?? extracted.driver_name)
    set('numero_reserva', extracted.confirmation_number)
    set('data_inicio', extracted.date)
    const notes: string[] = []
    if (extracted.origin) notes.push(`De: ${extracted.origin}`)
    if (extracted.destination) notes.push(`Para: ${extracted.destination}`)
    if (extracted.time) notes.push(`Hora: ${extracted.time}`)
    if (extracted.vehicle_type) notes.push(`Veículo: ${extracted.vehicle_type}`)
    if (extracted.notes) notes.push(String(extracted.notes))
    if (notes.length) set('observacoes', notes.join(' · '))
  } else if (voucherType === 'experience') {
    set('fornecedor', extracted.provider ?? extracted.experience_name)
    set('numero_reserva', extracted.confirmation_number)
    set('data_inicio', extracted.date)
    set('endereco', extracted.location)
    const notes: string[] = []
    if (extracted.time) notes.push(`Hora: ${extracted.time}`)
    if (extracted.quantity) notes.push(`Participantes: ${extracted.quantity}`)
    if (extracted.notes) notes.push(String(extracted.notes))
    if (notes.length) set('observacoes', notes.join(' · '))
  } else {
    // generic — copia o que parecer útil
    set('fornecedor', extracted.provider ?? extracted.hotel_name ?? extracted.airline_name)
    set('numero_reserva', extracted.confirmation_number ?? extracted.pnr)
    set('data_inicio', extracted.check_in ?? extracted.date)
    set('data_fim', extracted.check_out)
    set('endereco', extracted.address ?? extracted.location)
    set('telefone', extracted.phone)
    if (extracted.notes) set('observacoes', String(extracted.notes))
  }

  return patch
}
