/**
 * FlightSegmentEditor - Elite flight segment editor for multi-leg itineraries
 * 
 * Features:
 * - Smart Auto-fill: Next segment origin defaults to previous destination
 * - Compact and clean UI
 * - Airline selector with visual feedback
 */

import { useCallback } from 'react'
import { Plus, Trash2, GripVertical, Plane, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

// Airline options with codes
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

interface FlightSegmentEditorProps {
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
        departure_date: previousSegment?.arrival_date || '', // Suggest same day connection
        departure_time: '',
        departure_airport: previousSegment?.arrival_airport || '', // Auto-fill origin
        departure_city: previousSegment?.arrival_city || '',
        arrival_date: previousSegment?.arrival_date || '',
        arrival_time: '',
        arrival_airport: '',
        arrival_city: '',
        cabin_class: previousSegment?.cabin_class || 'Economy',
        baggage_included: previousSegment?.baggage_included || '',
    }
}

export function FlightSegmentEditor({ segments, onChange }: FlightSegmentEditorProps) {
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
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-sky-600" />
                    <span className="text-xs font-medium text-sky-700">
                        Trechos do Itinerário ({segments.length})
                    </span>
                </div>
            </div>

            {/* Segments List */}
            {segments.length === 0 ? (
                <div className="p-4 border-2 border-dashed border-sky-200 rounded-lg bg-sky-50/50 text-center">
                    <p className="text-sm text-sky-600 mb-2">Nenhum trecho adicionado</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddSegment}
                        className="border-sky-300 text-sky-700 hover:bg-sky-100"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Primeiro Trecho
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {segments.map((segment, index) => (
                        <SegmentCard
                            key={segment.id}
                            segment={segment}
                            index={index}

                            onUpdate={(updates) => handleUpdateSegment(index, updates)}
                            onRemove={() => handleRemoveSegment(index)}
                            onAirlineChange={(code) => handleAirlineChange(index, code)}
                        />
                    ))}

                    {/* Add More Button */}
                    <button
                        onClick={handleAddSegment}
                        className="w-full py-3 border-2 border-dashed border-sky-200 rounded-lg text-sky-600 hover:border-sky-400 hover:bg-sky-50 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span className="text-sm font-medium">
                            {segments.length > 0 ? 'Adicionar Conexão / Próximo Trecho' : 'Adicionar Trecho'}
                        </span>
                    </button>
                </div>
            )}
        </div>
    )
}

// Individual Segment Card
interface SegmentCardProps {
    segment: FlightSegment
    index: number

    onUpdate: (updates: Partial<FlightSegment>) => void
    onRemove: () => void
    onAirlineChange: (code: string) => void
}

function SegmentCard({ segment, index, onUpdate, onRemove, onAirlineChange }: SegmentCardProps) {
    const airline = AIRLINES.find(a => a.code === segment.airline_code) || AIRLINES[0]

    return (
        <div className="bg-white border border-sky-200 rounded-xl overflow-hidden shadow-sm">
            {/* Card Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border-b border-sky-100">
                <GripVertical className="h-4 w-4 text-sky-300 cursor-grab" />
                <div className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    airline.color
                )}>
                    Trecho {index + 1}
                </div>

                {/* Compact Airline Selector in Header */}
                <select
                    value={segment.airline_code}
                    onChange={(e) => onAirlineChange(e.target.value)}
                    className="h-6 text-xs border-none bg-transparent font-medium text-slate-600 focus:ring-0 cursor-pointer"
                >
                    {AIRLINES.map(a => (
                        <option key={a.code} value={a.code}>{a.name}</option>
                    ))}
                </select>

                <div className="flex-1" />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Card Content */}
            <div className="p-3 space-y-3">
                {/* Route Row: Origin -> Destination */}
                <div className="flex items-center gap-2">
                    {/* Origin */}
                    <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-sky-700 uppercase">Saída (De)</label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={segment.departure_airport}
                                onChange={(e) => onUpdate({ departure_airport: e.target.value.toUpperCase() })}
                                placeholder="GRU"
                                maxLength={3}
                                className="w-12 h-8 px-1 text-sm font-bold text-center border border-slate-200 rounded bg-slate-50 uppercase focus:border-sky-400 focus:bg-white transition-colors"
                            />
                            <input
                                type="time"
                                value={segment.departure_time}
                                onChange={(e) => onUpdate({ departure_time: e.target.value })}
                                className="flex-1 h-8 px-2 text-xs border border-slate-200 rounded bg-white focus:border-sky-400"
                            />
                        </div>
                        <input
                            type="date"
                            value={segment.departure_date}
                            onChange={(e) => onUpdate({ departure_date: e.target.value })}
                            className="w-full h-7 px-1 text-[10px] border-none bg-transparent text-slate-500 focus:ring-0 p-0"
                        />
                    </div>

                    <ArrowRight className="h-4 w-4 text-slate-300 mt-4" />

                    {/* Destination */}
                    <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-bold text-emerald-700 uppercase">Chegada (Para)</label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={segment.arrival_airport}
                                onChange={(e) => onUpdate({ arrival_airport: e.target.value.toUpperCase() })}
                                placeholder="MIA"
                                maxLength={3}
                                className="w-12 h-8 px-1 text-sm font-bold text-center border border-slate-200 rounded bg-slate-50 uppercase focus:border-emerald-400 focus:bg-white transition-colors"
                            />
                            <input
                                type="time"
                                value={segment.arrival_time}
                                onChange={(e) => onUpdate({ arrival_time: e.target.value })}
                                className="flex-1 h-8 px-2 text-xs border border-slate-200 rounded bg-white focus:border-emerald-400"
                            />
                        </div>
                        <input
                            type="date"
                            value={segment.arrival_date}
                            onChange={(e) => onUpdate({ arrival_date: e.target.value })}
                            className="w-full h-7 px-1 text-[10px] border-none bg-transparent text-slate-500 focus:ring-0 p-0"
                        />
                    </div>
                </div>

                {/* Details Row: Flight No, Class, Baggage */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                    <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Voo Nº</label>
                        <input
                            type="text"
                            value={segment.flight_number}
                            onChange={(e) => onUpdate({ flight_number: e.target.value })}
                            placeholder="1234"
                            className="w-full h-7 px-2 text-xs border border-slate-200 rounded bg-white focus:border-sky-400"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Classe</label>
                        <select
                            value={segment.cabin_class || 'Economy'}
                            onChange={(e) => onUpdate({ cabin_class: e.target.value })}
                            className="w-full h-7 px-1 text-xs border border-slate-200 rounded bg-white focus:border-sky-400"
                        >
                            <option value="Economy">Econômica</option>
                            <option value="Premium Economy">Premium</option>
                            <option value="Business">Executiva</option>
                            <option value="First">Primeira</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Bagagem</label>
                        <input
                            type="text"
                            value={segment.baggage_included || ''}
                            onChange={(e) => onUpdate({ baggage_included: e.target.value })}
                            placeholder="23kg"
                            className="w-full h-7 px-2 text-xs border border-slate-200 rounded bg-white focus:border-sky-400"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default FlightSegmentEditor
