/**
 * FlightOptionCard - Card de opção de voo para visualização mobile
 *
 * Design:
 * - Visual limpo e scanável
 * - Informações essenciais em destaque (horários, preço)
 * - Radio button para seleção
 * - Badge de "Recomendado"
 */

import { memo } from 'react'
import { Check, Luggage } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FlightOptionCardProps {
    option: {
        id: string
        airline_code: string
        airline_name: string
        flight_number: string
        departure_time: string
        arrival_time: string
        cabin_class: string
        fare_family: string
        baggage: string
        price: number
        is_recommended: boolean
    }
    isSelected: boolean
    onSelect: () => void
    showPrice?: boolean
}

// Calcular duração
function calculateDuration(departure: string, arrival: string): string {
    if (!departure || !arrival) return ''
    const [depH, depM] = departure.split(':').map(Number)
    const [arrH, arrM] = arrival.split(':').map(Number)
    let totalMinutes = (arrH * 60 + arrM) - (depH * 60 + depM)
    if (totalMinutes < 0) totalMinutes += 24 * 60
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h${minutes > 0 ? `${minutes}` : ''}`
}

// Formatar preço
function formatPrice(price: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(price)
}

// Cores por companhia
const AIRLINE_COLORS: Record<string, string> = {
    'LA': 'bg-indigo-100 text-indigo-700',
    'G3': 'bg-orange-100 text-orange-700',
    'AD': 'bg-blue-100 text-blue-700',
    'AA': 'bg-red-100 text-red-700',
    'UA': 'bg-sky-100 text-sky-700',
    'DL': 'bg-blue-100 text-blue-700',
    'default': 'bg-slate-100 text-slate-700'
}

export const FlightOptionCard = memo(function FlightOptionCard({
    option,
    isSelected,
    onSelect,
    showPrice = true
}: FlightOptionCardProps) {
    const duration = calculateDuration(option.departure_time, option.arrival_time)
    const airlineColor = AIRLINE_COLORS[option.airline_code] || AIRLINE_COLORS.default

    return (
        <button
            onClick={onSelect}
            className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all",
                isSelected
                    ? "border-emerald-500 bg-emerald-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300"
            )}
        >
            <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                    isSelected
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-slate-300"
                )}>
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                </div>

                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                    {/* Linha 1: Companhia + Badge recomendado */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                            "px-2 py-0.5 rounded-md text-xs font-bold",
                            airlineColor
                        )}>
                            {option.airline_name}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                            {option.airline_code} {option.flight_number}
                        </span>
                        {option.is_recommended && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                Recomendado
                            </span>
                        )}
                    </div>

                    {/* Linha 2: Horários */}
                    <div className="flex items-center gap-4 mb-2">
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {option.departure_time}
                            </p>
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-px bg-slate-200 relative">
                                <div className="absolute left-1/2 -translate-x-1/2 -top-2 text-[10px] text-slate-400 bg-white px-1">
                                    {duration}
                                </div>
                            </div>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {option.arrival_time}
                            </p>
                        </div>
                    </div>

                    {/* Linha 3: Detalhes */}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                            <span className="capitalize">{option.cabin_class?.replace('_', ' ')}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="capitalize">{option.fare_family}</span>
                        {option.baggage && (
                            <>
                                <span className="text-slate-300">•</span>
                                <span className="flex items-center gap-1">
                                    <Luggage className="h-3 w-3" />
                                    {option.baggage}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Preço */}
                {showPrice && option.price > 0 && (
                    <div className="text-right flex-shrink-0">
                        <p className={cn(
                            "text-lg font-bold",
                            isSelected ? "text-emerald-600" : "text-slate-900"
                        )}>
                            {formatPrice(option.price)}
                        </p>
                        <p className="text-[10px] text-slate-400">por pessoa</p>
                    </div>
                )}
            </div>
        </button>
    )
})

export default FlightOptionCard
