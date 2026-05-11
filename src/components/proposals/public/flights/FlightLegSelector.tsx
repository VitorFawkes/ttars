/**
 * FlightLegSelector - Seletor de opções por trecho (mobile)
 *
 * Design:
 * - Header com origem → destino e data
 * - Lista de opções como cards selecionáveis
 * - Visual claro de seleção
 */

import { memo, useMemo } from 'react'
import { Plane, Calendar, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FlightOptionCard } from './FlightOptionCard'

interface FlightOption {
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
    ordem: number
}

interface FlightLeg {
    id: string
    leg_type: 'outbound' | 'return' | 'connection'
    label: string
    origin_code: string
    origin_city: string
    destination_code: string
    destination_city: string
    date: string
    options: FlightOption[]
}

interface FlightLegSelectorProps {
    leg: FlightLeg
    selectedOptionId: string | null
    onSelectOption: (optionId: string) => void
    showPrices?: boolean
    isCollapsed?: boolean
    onToggleCollapse?: () => void
}

// Formatar data
function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    })
}

// Cores do header por tipo
const LEG_COLORS = {
    outbound: {
        bg: 'bg-sky-500',
        light: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-200'
    },
    return: {
        bg: 'bg-emerald-500',
        light: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200'
    },
    connection: {
        bg: 'bg-purple-500',
        light: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200'
    }
}

export const FlightLegSelector = memo(function FlightLegSelector({
    leg,
    selectedOptionId,
    onSelectOption,
    showPrices = true,
    isCollapsed = false,
    onToggleCollapse
}: FlightLegSelectorProps) {
    const colors = LEG_COLORS[leg.leg_type]

    // Ordenar opções
    const sortedOptions = useMemo(() => {
        return [...leg.options].sort((a, b) => {
            // Recomendado primeiro
            if (a.is_recommended !== b.is_recommended) {
                return a.is_recommended ? -1 : 1
            }
            // Depois por preço
            return a.price - b.price
        })
    }, [leg.options])

    // Opção selecionada (para mostrar quando colapsado)
    const selectedOption = useMemo(() => {
        return leg.options.find(o => o.id === selectedOptionId)
    }, [leg.options, selectedOptionId])

    return (
        <div className={cn("rounded-2xl overflow-hidden border-2", colors.border)}>
            {/* Header */}
            <button
                onClick={onToggleCollapse}
                className={cn(
                    "w-full px-4 py-3 flex items-center gap-3",
                    colors.bg,
                    "text-white"
                )}
            >
                {/* Ícone e label */}
                <div className="flex items-center gap-2">
                    <Plane className="h-5 w-5" />
                    <span className="font-bold uppercase tracking-wide text-sm">
                        {leg.label}
                    </span>
                </div>

                {/* Rota */}
                <div className="flex items-center gap-2 flex-1">
                    <span className="font-bold text-lg">{leg.origin_code}</span>
                    <ArrowRight className="h-4 w-4 opacity-60" />
                    <span className="font-bold text-lg">{leg.destination_code}</span>
                </div>

                {/* Data */}
                {leg.date && (
                    <div className="flex items-center gap-1 text-sm opacity-90">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(leg.date)}</span>
                    </div>
                )}

                {/* Expand/collapse */}
                {onToggleCollapse && (
                    <div className="ml-2">
                        {isCollapsed ? (
                            <ChevronDown className="h-5 w-5" />
                        ) : (
                            <ChevronUp className="h-5 w-5" />
                        )}
                    </div>
                )}
            </button>

            {/* Subheader com cidades */}
            <div className={cn("px-4 py-2 text-sm flex items-center gap-2", colors.light, colors.text)}>
                <span>{leg.origin_city}</span>
                <span className="text-slate-300">→</span>
                <span>{leg.destination_city}</span>

                {/* Mostrar opção selecionada quando colapsado */}
                {isCollapsed && selectedOption && (
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-white">
                            {selectedOption.airline_name} {selectedOption.flight_number}
                        </span>
                        <span className="font-bold">
                            {selectedOption.departure_time}
                        </span>
                    </div>
                )}
            </div>

            {/* Lista de opções */}
            {!isCollapsed && (
                <div className="p-4 space-y-3 bg-slate-50">
                    {sortedOptions.length === 0 ? (
                        <div className="text-center py-6 text-slate-400">
                            <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Nenhuma opção disponível</p>
                        </div>
                    ) : (
                        sortedOptions.map((option) => (
                            <FlightOptionCard
                                key={option.id}
                                option={option}
                                isSelected={selectedOptionId === option.id}
                                onSelect={() => onSelectOption(option.id)}
                                showPrice={showPrices}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    )
})

export default FlightLegSelector
