/**
 * FlightOptionRow - Uma linha de opção de voo dentro de um trecho
 *
 * Design:
 * - Compacto e scanável (estilo planilha)
 * - Todos os campos editáveis inline
 * - Tab navigation entre campos
 * - Visual feedback de "recomendado"
 * - Extras expansiveis (bagagem, assento, refeicao)
 */

import { useState, useCallback, memo } from 'react'
import { Trash2, Star, GripVertical, ChevronDown, ChevronUp, Luggage, Armchair, UtensilsCrossed, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    type FlightOption,
    type FlightExtras,
    AIRLINES,
    CABIN_CLASSES,
    FARE_FAMILIES,
    getAirlineInfo,
    calculateDuration
} from './types'

interface FlightOptionRowProps {
    option: FlightOption
    onChange: (updates: Partial<FlightOption>) => void
    onRemove: () => void
    onSetRecommended: () => void
    showDragHandle?: boolean
}

export const FlightOptionRow = memo(function FlightOptionRow({
    option,
    onChange,
    onRemove,
    onSetRecommended,
    showDragHandle = true
}: FlightOptionRowProps) {
    const [showExtras, setShowExtras] = useState(false)
    const airline = getAirlineInfo(option.airline_code)
    const duration = calculateDuration(option.departure_time, option.arrival_time)

    const handleAirlineChange = useCallback((code: string) => {
        const airline = AIRLINES.find(a => a.code === code)
        onChange({
            airline_code: code,
            airline_name: airline?.name || code
        })
    }, [onChange])

    const updateExtras = useCallback((updates: Partial<FlightExtras>) => {
        onChange({
            extras: { ...option.extras, ...updates }
        })
    }, [option.extras, onChange])

    const hasExtras = option.extras && (
        option.extras.baggage_checked ||
        option.extras.baggage_price ||
        option.extras.seat_selection ||
        option.extras.seat_price ||
        option.extras.meal_included
    )

    return (
        <div className="rounded-lg border transition-all duration-150">
            {/* Linha Principal */}
            <div
                className={cn(
                    "grid grid-cols-[auto_1fr_80px_80px_100px_80px_80px_auto] gap-2 p-2 items-center",
                    "group",
                    option.is_recommended
                        ? "bg-amber-50 border-amber-200"
                        : "bg-white hover:bg-slate-50"
                )}
            >
            {/* Drag Handle + Star */}
            <div className="flex items-center gap-1">
                {showDragHandle && (
                    <GripVertical className="h-4 w-4 text-slate-300 cursor-grab active:cursor-grabbing" />
                )}
                <button
                    onClick={onSetRecommended}
                    className={cn(
                        "p-1 rounded transition-colors",
                        option.is_recommended
                            ? "text-amber-500"
                            : "text-slate-300 hover:text-amber-400"
                    )}
                    title={option.is_recommended ? "Opção recomendada" : "Marcar como recomendada"}
                >
                    <Star className={cn("h-4 w-4", option.is_recommended && "fill-amber-500")} />
                </button>
            </div>

            {/* Companhia + Número do Voo */}
            <div className="flex items-center gap-2">
                <select
                    value={option.airline_code}
                    onChange={(e) => handleAirlineChange(e.target.value)}
                    className={cn(
                        "h-8 px-2 text-xs font-medium rounded-md border-0",
                        airline.color
                    )}
                >
                    {AIRLINES.map(a => (
                        <option key={a.code} value={a.code}>{a.name}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={option.flight_number}
                    onChange={(e) => onChange({ flight_number: e.target.value.toUpperCase() })}
                    placeholder="1234"
                    className="w-16 h-8 px-2 text-xs font-mono text-center border border-slate-200 rounded-md focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                />
            </div>

            {/* Saída */}
            <input
                type="time"
                value={option.departure_time}
                onChange={(e) => onChange({ departure_time: e.target.value })}
                className="h-8 px-2 text-sm font-semibold text-center border border-slate-200 rounded-md focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />

            {/* Chegada */}
            <div className="flex flex-col items-center">
                <input
                    type="time"
                    value={option.arrival_time}
                    onChange={(e) => onChange({ arrival_time: e.target.value })}
                    className="h-8 px-2 text-sm font-semibold text-center border border-slate-200 rounded-md focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                />
                {duration && (
                    <span className="text-[10px] text-slate-400 mt-0.5">{duration}</span>
                )}
            </div>

            {/* Classe + Tarifa */}
            <div className="flex flex-col gap-1">
                <select
                    value={option.cabin_class}
                    onChange={(e) => onChange({ cabin_class: e.target.value })}
                    className="h-6 px-1 text-[10px] border border-slate-200 rounded focus:border-sky-400"
                >
                    {CABIN_CLASSES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
                <select
                    value={option.fare_family}
                    onChange={(e) => onChange({ fare_family: e.target.value })}
                    className="h-6 px-1 text-[10px] border border-slate-200 rounded focus:border-sky-400"
                >
                    {FARE_FAMILIES.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                </select>
            </div>

            {/* Bagagem */}
            <input
                type="text"
                value={option.baggage}
                onChange={(e) => onChange({ baggage: e.target.value })}
                placeholder="23kg"
                className="h-8 px-2 text-xs text-center border border-slate-200 rounded-md focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            />

            {/* Preço */}
            <div className="flex items-center gap-1">
                <span className="text-xs text-slate-400">R$</span>
                <input
                    type="number"
                    value={option.price || ''}
                    onChange={(e) => onChange({ price: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    step="0.01"
                    className={cn(
                        "w-20 h-8 px-2 text-sm font-bold text-right border rounded-md",
                        "focus:ring-1",
                        option.is_recommended
                            ? "border-amber-300 bg-amber-50 text-amber-700 focus:border-amber-400 focus:ring-amber-400"
                            : "border-slate-200 text-slate-700 focus:border-emerald-400 focus:ring-emerald-400"
                    )}
                />
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => setShowExtras(!showExtras)}
                    className={cn(
                        "p-1.5 rounded transition-colors",
                        hasExtras ? "text-sky-500" : "text-slate-300 hover:text-slate-500"
                    )}
                    title="Extras (bagagem, assento, refeição)"
                >
                    {showExtras ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button
                    onClick={onRemove}
                    className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
            </div>

            {/* Extras Expansível */}
            {showExtras && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                    <div className="grid grid-cols-3 gap-4">
                        {/* Bagagem Despachada */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-slate-500 uppercase flex items-center gap-1">
                                <Luggage className="h-3 w-3" />
                                Bagagem Extra
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={option.extras?.baggage_checked || ''}
                                    onChange={(e) => updateExtras({ baggage_checked: e.target.value })}
                                    placeholder="23kg"
                                    className="flex-1 h-7 px-2 text-xs border border-slate-200 rounded focus:border-sky-400"
                                />
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">R$</span>
                                    <input
                                        type="number"
                                        value={option.extras?.baggage_price || ''}
                                        onChange={(e) => updateExtras({ baggage_price: parseFloat(e.target.value) || 0 })}
                                        placeholder="0"
                                        className="w-16 h-7 px-2 text-xs text-right border border-slate-200 rounded focus:border-sky-400"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Seleção de Assento */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-slate-500 uppercase flex items-center gap-1">
                                <Armchair className="h-3 w-3" />
                                Assento
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => updateExtras({ seat_selection: !option.extras?.seat_selection })}
                                    className={cn(
                                        "p-1 rounded transition-colors",
                                        option.extras?.seat_selection ? "text-sky-500" : "text-slate-300"
                                    )}
                                >
                                    {option.extras?.seat_selection ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                                </button>
                                {option.extras?.seat_selection && (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            value={option.extras?.seat_price || ''}
                                            onChange={(e) => updateExtras({ seat_price: parseFloat(e.target.value) || 0 })}
                                            placeholder="0"
                                            className="w-16 h-7 px-2 text-xs text-right border border-slate-200 rounded focus:border-sky-400"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Refeição */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium text-slate-500 uppercase flex items-center gap-1">
                                <UtensilsCrossed className="h-3 w-3" />
                                Refeição
                            </label>
                            <button
                                onClick={() => updateExtras({ meal_included: !option.extras?.meal_included })}
                                className={cn(
                                    "flex items-center gap-2 h-7 px-2 rounded border transition-colors",
                                    option.extras?.meal_included
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 text-slate-400 hover:border-slate-300"
                                )}
                            >
                                {option.extras?.meal_included ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                                <span className="text-xs">{option.extras?.meal_included ? 'Incluída' : 'Não incluída'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
})

export default FlightOptionRow
