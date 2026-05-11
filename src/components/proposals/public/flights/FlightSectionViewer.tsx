/**
 * FlightSectionViewer - Visualização completa de voos para o cliente
 *
 * Design:
 * - Mostra todos os trechos da viagem
 * - Cliente seleciona uma opção em cada trecho
 * - Mostra total calculado
 * - Otimizado para mobile
 */

import { memo, useMemo, useState, useCallback } from 'react'
import { Plane, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FlightLegSelector } from './FlightLegSelector'

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
    ordem: number
}

interface FlightsData {
    legs: FlightLeg[]
    show_prices: boolean
    default_selections: Record<string, string>
}

interface FlightSectionViewerProps {
    data: FlightsData
    selections: Record<string, string>  // { leg_id: option_id }
    onSelectionChange: (legId: string, optionId: string) => void
    showPrices?: boolean
}

// Formatar preço
function formatPrice(price: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(price)
}

export const FlightSectionViewer = memo(function FlightSectionViewer({
    data,
    selections,
    onSelectionChange,
    showPrices = true
}: FlightSectionViewerProps) {
    // Track collapsed legs
    const [collapsedLegs, setCollapsedLegs] = useState<Record<string, boolean>>({})

    // Ordenar legs
    const sortedLegs = useMemo(() => {
        return [...data.legs].sort((a, b) => a.ordem - b.ordem)
    }, [data.legs])

    // Calcular total das opções selecionadas
    const total = useMemo(() => {
        return sortedLegs.reduce((sum, leg) => {
            const selectedOptionId = selections[leg.id]
            if (!selectedOptionId) return sum
            const option = leg.options.find(o => o.id === selectedOptionId)
            return sum + (option?.price || 0)
        }, 0)
    }, [sortedLegs, selections])

    // Verificar se todas as seleções foram feitas
    const allSelected = useMemo(() => {
        return sortedLegs.every(leg => selections[leg.id])
    }, [sortedLegs, selections])

    // Toggle collapse
    const handleToggleCollapse = useCallback((legId: string) => {
        setCollapsedLegs(prev => ({
            ...prev,
            [legId]: !prev[legId]
        }))
    }, [])

    // Se não tem legs, não renderiza
    if (sortedLegs.length === 0) {
        return null
    }

    return (
        <div className="space-y-4">
            {/* Header da seção */}
            <div className="flex items-center gap-2 px-1">
                <Plane className="h-5 w-5 text-sky-600" />
                <h2 className="font-bold text-lg text-slate-900">Voos</h2>
                <span className="text-sm text-slate-400">
                    ({sortedLegs.length} trecho{sortedLegs.length !== 1 && 's'})
                </span>
            </div>

            {/* Instrução */}
            <div className="flex items-start gap-2 px-3 py-2 bg-sky-50 rounded-lg text-sm text-sky-700">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>Selecione uma opção em cada trecho para continuar</p>
            </div>

            {/* Lista de trechos */}
            <div className="space-y-4">
                {sortedLegs.map((leg) => (
                    <FlightLegSelector
                        key={leg.id}
                        leg={leg}
                        selectedOptionId={selections[leg.id] || null}
                        onSelectOption={(optionId) => onSelectionChange(leg.id, optionId)}
                        showPrices={showPrices && data.show_prices}
                        isCollapsed={collapsedLegs[leg.id] || false}
                        onToggleCollapse={() => handleToggleCollapse(leg.id)}
                    />
                ))}
            </div>

            {/* Total */}
            {showPrices && data.show_prices && total > 0 && (
                <div className={cn(
                    "sticky bottom-0 p-4 rounded-xl border-2",
                    allSelected
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-amber-50 border-amber-200"
                )}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500">Total dos voos</p>
                            <p className={cn(
                                "text-2xl font-bold",
                                allSelected ? "text-emerald-600" : "text-amber-600"
                            )}>
                                {formatPrice(total)}
                            </p>
                        </div>
                        {!allSelected && (
                            <div className="text-right">
                                <p className="text-xs text-amber-600">
                                    Selecione todas as opções
                                </p>
                                <p className="text-xs text-slate-400">
                                    {sortedLegs.filter(l => selections[l.id]).length} de {sortedLegs.length} selecionados
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
})

export default FlightSectionViewer
