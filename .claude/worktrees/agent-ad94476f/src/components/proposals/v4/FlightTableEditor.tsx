/**
 * FlightTableEditor - High-density, efficient flight segment editor
 * 
 * Design Philosophy:
 * - "Excel-like" efficiency: Edit in place, no expanding cards
 * - Visual density: Show more context in less space
 * - Keyboard friendly: Tab through fields
 */

import { useCallback } from 'react'
import { Plus, Trash2, ArrowRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// Airline options (same as before)
const AIRLINES = [
    { code: 'LA', name: 'LATAM', color: 'bg-indigo-100 text-indigo-700' },
    { code: 'G3', name: 'GOL', color: 'bg-orange-100 text-orange-700' },
    { code: 'AD', name: 'Azul', color: 'bg-blue-100 text-blue-700' },
    { code: 'AA', name: 'American', color: 'bg-red-100 text-red-700' },
    { code: 'UA', name: 'United', color: 'bg-sky-100 text-sky-700' },
    { code: 'DL', name: 'Delta', color: 'bg-blue-100 text-blue-700' },
    { code: 'AF', name: 'Air France', color: 'bg-blue-100 text-blue-700' },
    { code: 'BA', name: 'British Airways', color: 'bg-red-100 text-red-700' },
    { code: 'IB', name: 'Iberia', color: 'bg-red-100 text-red-700' },
    { code: 'TP', name: 'TAP Portugal', color: 'bg-emerald-100 text-emerald-700' },
    { code: 'AZ', name: 'ITA Airways', color: 'bg-emerald-100 text-emerald-700' },
    { code: 'LH', name: 'Lufthansa', color: 'bg-yellow-100 text-yellow-700' },
    { code: 'EK', name: 'Emirates', color: 'bg-amber-100 text-amber-700' },
    { code: 'OTHER', name: 'Outra', color: 'bg-slate-100 text-slate-700' },
]

export interface FlightSegment {
    id: string
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
}

interface FlightTableEditorProps {
    segments: FlightSegment[]
    onChange: (segments: FlightSegment[]) => void
}

function createEmptySegment(order: number, previousSegment?: FlightSegment): FlightSegment {
    return {
        id: `seg-${Date.now()}-${order}`,
        segment_order: order,
        airline_code: previousSegment?.airline_code || 'LA',
        airline_name: previousSegment?.airline_name || 'LATAM',
        flight_number: '',
        departure_date: previousSegment?.arrival_date || '',
        departure_time: '',
        departure_airport: previousSegment?.arrival_airport || '',
        departure_city: previousSegment?.arrival_city || '',
        arrival_date: previousSegment?.arrival_date || '',
        arrival_time: '',
        arrival_airport: '',
        arrival_city: '',
        cabin_class: previousSegment?.cabin_class || 'Economy',
        baggage_included: previousSegment?.baggage_included || '',
    }
}

export function FlightTableEditor({ segments, onChange }: FlightTableEditorProps) {
    const handleAddSegment = useCallback(() => {
        const lastSegment = segments[segments.length - 1]
        const newSegment = createEmptySegment(segments.length + 1, lastSegment)
        onChange([...segments, newSegment])
    }, [segments, onChange])

    const handleRemoveSegment = useCallback((index: number) => {
        const newSegments = segments.filter((_, i) => i !== index)
            .map((seg, i) => ({ ...seg, segment_order: i + 1 }))
        onChange(newSegments)
    }, [segments, onChange])

    const handleUpdateSegment = useCallback((index: number, updates: Partial<FlightSegment>) => {
        const newSegments = [...segments]
        newSegments[index] = { ...newSegments[index], ...updates }
        onChange(newSegments)
    }, [segments, onChange])

    const handleAirlineChange = useCallback((index: number, code: string) => {
        const airline = AIRLINES.find(a => a.code === code) || AIRLINES[0]
        handleUpdateSegment(index, {
            airline_code: code,
            airline_name: airline.name
        })
    }, [handleUpdateSegment])

    return (
        <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-[1.5fr_1fr_2fr_0.5fr_2fr_1fr_auto] gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-t-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div>Companhia / Voo</div>
                <div>Data</div>
                <div>Origem (Saída)</div>
                <div></div>
                <div>Destino (Chegada)</div>
                <div>Detalhes</div>
                <div className="w-8"></div>
            </div>

            {/* Segments Rows */}
            <div className="space-y-1">
                {segments.map((segment, index) => (
                    <div
                        key={segment.id}
                        className="grid grid-cols-[1.5fr_1fr_2fr_0.5fr_2fr_1fr_auto] gap-2 p-2 bg-white border border-slate-200 rounded-lg items-start shadow-sm hover:border-sky-300 transition-colors group"
                    >
                        {/* 1. Airline & Flight */}
                        <div className="space-y-1">
                            <select
                                value={segment.airline_code}
                                onChange={(e) => handleAirlineChange(index, e.target.value)}
                                className="w-full h-7 text-xs border border-slate-200 rounded bg-slate-50 focus:bg-white focus:border-sky-400"
                            >
                                {AIRLINES.map(a => (
                                    <option key={a.code} value={a.code}>{a.name}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={segment.flight_number}
                                onChange={(e) => handleUpdateSegment(index, { flight_number: e.target.value })}
                                placeholder="Nº Voo"
                                className="w-full h-7 px-2 text-xs border border-slate-200 rounded focus:border-sky-400"
                            />
                        </div>

                        {/* 2. Date */}
                        <div className="space-y-1">
                            <input
                                type="date"
                                value={segment.departure_date}
                                onChange={(e) => handleUpdateSegment(index, { departure_date: e.target.value })}
                                className="w-full h-7 px-1 text-[10px] border border-slate-200 rounded focus:border-sky-400"
                            />
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 justify-center">
                                <Calendar className="h-3 w-3" />
                            </div>
                        </div>

                        {/* 3. Origin */}
                        <div className="space-y-1">
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={segment.departure_airport}
                                    onChange={(e) => handleUpdateSegment(index, { departure_airport: e.target.value.toUpperCase() })}
                                    placeholder="GRU"
                                    maxLength={3}
                                    className="w-12 h-7 px-1 text-xs font-bold text-center border border-slate-200 rounded bg-slate-50 uppercase focus:bg-white focus:border-sky-400"
                                />
                                <input
                                    type="time"
                                    value={segment.departure_time}
                                    onChange={(e) => handleUpdateSegment(index, { departure_time: e.target.value })}
                                    className="flex-1 h-7 px-1 text-xs border border-slate-200 rounded focus:border-sky-400"
                                />
                            </div>
                            <input
                                type="text"
                                value={segment.departure_city}
                                onChange={(e) => handleUpdateSegment(index, { departure_city: e.target.value })}
                                placeholder="Cidade Origem"
                                className="w-full h-6 px-1 text-[10px] border-none bg-transparent text-slate-500 placeholder:text-slate-300 focus:ring-0 p-0"
                            />
                        </div>

                        {/* 4. Arrow */}
                        <div className="flex items-center justify-center h-full pt-1">
                            <ArrowRight className="h-4 w-4 text-slate-300" />
                        </div>

                        {/* 5. Destination */}
                        <div className="space-y-1">
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={segment.arrival_airport}
                                    onChange={(e) => handleUpdateSegment(index, { arrival_airport: e.target.value.toUpperCase() })}
                                    placeholder="MIA"
                                    maxLength={3}
                                    className="w-12 h-7 px-1 text-xs font-bold text-center border border-slate-200 rounded bg-slate-50 uppercase focus:bg-white focus:border-emerald-400"
                                />
                                <input
                                    type="time"
                                    value={segment.arrival_time}
                                    onChange={(e) => handleUpdateSegment(index, { arrival_time: e.target.value })}
                                    className="flex-1 h-7 px-1 text-xs border border-slate-200 rounded focus:border-emerald-400"
                                />
                            </div>
                            <input
                                type="text"
                                value={segment.arrival_city}
                                onChange={(e) => handleUpdateSegment(index, { arrival_city: e.target.value })}
                                placeholder="Cidade Destino"
                                className="w-full h-6 px-1 text-[10px] border-none bg-transparent text-slate-500 placeholder:text-slate-300 focus:ring-0 p-0"
                            />
                        </div>

                        {/* 6. Details (Class/Bag) */}
                        <div className="space-y-1">
                            <select
                                value={segment.cabin_class || 'Economy'}
                                onChange={(e) => handleUpdateSegment(index, { cabin_class: e.target.value })}
                                className="w-full h-7 px-1 text-[10px] border border-slate-200 rounded bg-white focus:border-sky-400"
                            >
                                <option value="Economy">Econ.</option>
                                <option value="Premium Economy">Prem.</option>
                                <option value="Business">Exec.</option>
                                <option value="First">First</option>
                            </select>
                            <input
                                type="text"
                                value={segment.baggage_included || ''}
                                onChange={(e) => handleUpdateSegment(index, { baggage_included: e.target.value })}
                                placeholder="Bagagem"
                                className="w-full h-7 px-2 text-[10px] border border-slate-200 rounded focus:border-sky-400"
                            />
                        </div>

                        {/* 7. Actions */}
                        <div className="flex items-center justify-center pt-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveSegment(index)}
                                className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Button */}
            <button
                onClick={handleAddSegment}
                className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all flex items-center justify-center gap-2 text-xs font-medium"
            >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Trecho
            </button>
        </div>
    )
}

export default FlightTableEditor
