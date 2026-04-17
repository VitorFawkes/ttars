/**
 * FlightItinerary - Premium visual timeline for multi-leg flight itineraries
 *
 * Features:
 * - COMPACT mobile card (~280px) with "Ver itinerário" modal
 * - Table-based layout for desktop
 * - Transit time calculation between segments
 * - Intelligent IDA/VOLTA grouping
 */

import { useState } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import { Plane, Clock, Check, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FlightSegment {
    id?: string
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

interface FlightItineraryProps {
    item: ProposalItemWithOptions
    isSelected: boolean
    onToggle: () => void
}

// Airline colors
const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
    'LA': { bg: 'bg-indigo-600', text: 'text-white' },
    'G3': { bg: 'bg-orange-500', text: 'text-white' },
    'AD': { bg: 'bg-blue-600', text: 'text-white' },
    'AA': { bg: 'bg-red-600', text: 'text-white' },
    'UA': { bg: 'bg-sky-600', text: 'text-white' },
    'DL': { bg: 'bg-blue-700', text: 'text-white' },
    'AF': { bg: 'bg-blue-800', text: 'text-white' },
    'TP': { bg: 'bg-emerald-600', text: 'text-white' },
    'IB': { bg: 'bg-red-700', text: 'text-white' },
    'LH': { bg: 'bg-yellow-500', text: 'text-slate-900' },
}

function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    try {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    } catch {
        return dateStr
    }
}

// @ts-expect-error Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _formatDateShort(dateStr: string): string {
    if (!dateStr) return ''
    try {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    } catch {
        return dateStr
    }
}

function formatTime(timeStr: string): string {
    if (!timeStr) return '--:--'
    return timeStr.substring(0, 5)
}

function calculateDuration(dep: { date: string; time: string }, arr: { date: string; time: string }): string {
    if (!dep.date || !dep.time || !arr.date || !arr.time) return ''
    try {
        const depDate = new Date(`${dep.date}T${dep.time}`)
        const arrDate = new Date(`${arr.date}T${arr.time}`)
        const diffMs = arrDate.getTime() - depDate.getTime()
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}h ${mins > 0 ? mins + 'm' : ''}`
    } catch {
        return ''
    }
}

function calculateTransitTime(currentArr: { date: string; time: string }, nextDep: { date: string; time: string }): string | null {
    if (!currentArr.date || !currentArr.time || !nextDep.date || !nextDep.time) return null
    try {
        const arrDate = new Date(`${currentArr.date}T${currentArr.time}`)
        const depDate = new Date(`${nextDep.date}T${nextDep.time}`)
        const diffMs = depDate.getTime() - arrDate.getTime()
        if (diffMs < 0) return null
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}h ${mins > 0 ? mins + 'm' : ''}`
    } catch {
        return null
    }
}

// Intelligently group segments into IDA and VOLTA
function groupSegments(segments: FlightSegment[]): { ida: FlightSegment[]; volta: FlightSegment[] } {
    if (segments.length === 0) return { ida: [], volta: [] }
    if (segments.length === 1) return { ida: segments, volta: [] }

    const originAirport = segments[0].departure_airport
    let returnStartIndex = -1

    for (let i = 1; i < segments.length; i++) {
        if (segments[i].arrival_airport === originAirport) {
            for (let j = i; j >= 1; j--) {
                if (segments[j - 1].arrival_airport === segments[j].departure_airport) {
                    returnStartIndex = j
                } else {
                    break
                }
            }
            if (returnStartIndex === -1) returnStartIndex = i
            break
        }
    }

    if (returnStartIndex === -1) {
        for (let i = 0; i < segments.length - 1; i++) {
            const d1 = new Date(segments[i].arrival_date)
            const d2 = new Date(segments[i + 1].departure_date)
            const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)
            if (diffDays > 2) {
                returnStartIndex = i + 1
                break
            }
        }
    }

    if (returnStartIndex === -1) {
        return { ida: segments, volta: [] }
    }

    return {
        ida: segments.slice(0, returnStartIndex),
        volta: segments.slice(returnStartIndex)
    }
}

export function FlightItinerary({ item, isSelected, onToggle }: FlightItineraryProps) {
    const [showModal, setShowModal] = useState(false)

    const richContent = (item.rich_content as Record<string, unknown>) || {}
    const segments = ((richContent.segments as FlightSegment[]) || []).map((seg, idx) => ({
        ...seg,
        id: seg.id || `seg-${idx}`
    }))

    const formatPrice = (value: number | string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(Number(value) || 0)

    if (segments.length === 0) {
        return (
            <div className="p-6 bg-sky-50 rounded-xl border-2 border-dashed border-sky-200 text-center">
                <Plane className="h-10 w-10 text-sky-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-sky-700">Nenhum trecho configurado</p>
                <p className="text-xs text-sky-500 mt-1">Adicione trechos ou envie uma imagem</p>
            </div>
        )
    }

    const { ida, volta } = groupSegments(segments)

    // Get summary info for compact card
    const firstSegment = segments[0]
    const lastIdaSegment = ida[ida.length - 1]
    const hasReturn = volta.length > 0

    // Extract flight info from first segment
    const airlineCode = firstSegment?.airline_code || ''
    const airlineName = firstSegment?.airline_name || ''
    const flightNumber = firstSegment?.flight_number || ''
    const cabinClass = firstSegment?.cabin_class || ''
    const baggageIncluded = firstSegment?.baggage_included || ''
    const departureAirport = firstSegment?.departure_airport || ''
    const departureTime = firstSegment?.departure_time || ''
    const arrivalAirport = lastIdaSegment?.arrival_airport || ''
    const arrivalTime = lastIdaSegment?.arrival_time || ''

    // Calculate duration for IDA
    const idaDuration = firstSegment && lastIdaSegment
        ? calculateDuration(
            { date: firstSegment.departure_date, time: firstSegment.departure_time },
            { date: lastIdaSegment.arrival_date, time: lastIdaSegment.arrival_time }
        )
        : ''

    // Calculate stops
    const idaStops = ida.length - 1

    // Check if arrival is next day
    const isNextDay = firstSegment?.departure_date !== lastIdaSegment?.arrival_date

    // Airline color
    const airlineStyle = AIRLINE_COLORS[airlineCode] || { bg: 'bg-indigo-100', text: 'text-indigo-600' }

    return (
        <>
            {/* ==================== MOBILE: COMPACT CARD (~150px) - MOCKUP EXACT ==================== */}
            <div className="md:hidden">
                <div
                    onClick={onToggle}
                    className={cn(
                        "bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-200 cursor-pointer",
                        isSelected
                            ? "border-2 border-blue-500"
                            : "border border-slate-200"
                    )}
                >
                    {/* HEADER: Companhia + Preço + Check (conforme mockup) */}
                    <div className="p-3 flex items-center justify-between border-b border-slate-100">
                        {/* Logo + Info Companhia (esquerda) */}
                        <div className="flex items-center gap-2">
                            {/* Logo da companhia - quadrado 32x32 */}
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                isSelected ? 'bg-blue-100' : airlineStyle.bg.replace('bg-', 'bg-').replace('-600', '-100').replace('-500', '-100').replace('-700', '-100').replace('-800', '-100')
                            )}>
                                <span className={cn(
                                    "text-xs font-bold",
                                    isSelected ? 'text-blue-600' : airlineStyle.text.replace('text-white', 'text-indigo-600').replace('text-slate-900', 'text-yellow-700')
                                )}>
                                    {airlineCode || 'FL'}
                                </span>
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-slate-900">
                                    {airlineName} {flightNumber}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {cabinClass || 'Econômica'}
                                </p>
                            </div>
                        </div>

                        {/* Preço + Checkbox (direita) */}
                        <div className="flex items-center gap-2">
                            <p className={cn(
                                "font-bold",
                                isSelected ? 'text-emerald-600' : 'text-emerald-600'
                            )}>
                                {formatPrice(item.base_price)}
                            </p>
                            <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center",
                                isSelected
                                    ? "bg-blue-600"
                                    : "bg-white border-2 border-slate-300"
                            )}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </div>
                    </div>

                    {/* CONTENT: Rota Visual (conforme mockup) */}
                    <div className="p-3">
                        {/* GRU → 12h30 → FCO */}
                        <div className="flex items-center justify-between">
                            {/* Origem */}
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-900">{departureAirport}</p>
                                <p className="text-xs text-slate-500">{formatTime(departureTime)}</p>
                            </div>

                            {/* Duração visual */}
                            <div className="flex-1 px-4">
                                <div className="flex items-center">
                                    <div className="h-0.5 flex-1 bg-slate-200" />
                                    <div className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
                                        {idaDuration || '—'}
                                    </div>
                                    <div className="h-0.5 flex-1 bg-slate-200" />
                                </div>
                                <p className="text-center text-xs text-slate-400 mt-1">
                                    {idaStops === 0 ? 'Direto' : `${idaStops} parada${idaStops > 1 ? 's' : ''}`}
                                </p>
                            </div>

                            {/* Destino */}
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-900">{arrivalAirport}</p>
                                <p className="text-xs text-slate-500">
                                    {formatTime(arrivalTime)}{isNextDay ? ' +1' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Badge de bagagem */}
                        <div className="flex justify-center gap-2 mt-2">
                            {baggageIncluded && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                                    {baggageIncluded}
                                </span>
                            )}
                            {hasReturn && (
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">
                                    Ida e Volta
                                </span>
                            )}
                        </div>

                        {/* Ver itinerário completo - only if multiple segments or return */}
                        {(segments.length > 1 || hasReturn) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowModal(true)
                                }}
                                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1 py-1.5"
                            >
                                <Info className="h-3 w-3" />
                                Ver itinerário completo
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ==================== DESKTOP: DETAILED TABLE ==================== */}
            <button
                onClick={onToggle}
                className={cn(
                    "hidden md:block w-full text-left rounded-xl border-2 overflow-hidden transition-all duration-200",
                    isSelected
                        ? "border-emerald-400 bg-white shadow-lg ring-2 ring-emerald-400/20"
                        : "border-slate-200 bg-white hover:border-sky-300 hover:shadow-md"
                )}
            >
                {/* Header */}
                <div className={cn(
                    "flex items-center justify-between px-4 py-3 transition-colors",
                    isSelected ? "bg-emerald-50" : "bg-gradient-to-r from-sky-50 to-indigo-50"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            isSelected ? "bg-emerald-100" : "bg-sky-100"
                        )}>
                            <Plane className={cn(
                                "h-5 w-5",
                                isSelected ? "text-emerald-600" : "text-sky-600"
                            )} />
                        </div>
                        <div>
                            <span className="font-semibold text-slate-800 block">
                                {item.title || 'Itinerário Aéreo'}
                            </span>
                            <span className="text-xs text-slate-500">
                                {segments.length} trecho{segments.length > 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                    <div className={cn(
                        "font-bold text-lg",
                        isSelected ? "text-emerald-600" : "text-slate-700"
                    )}>
                        {formatPrice(item.base_price)}
                    </div>
                </div>

                {/* Content Container */}
                <div className="bg-white">
                    {/* IDA Section */}
                    {ida.length > 0 && (
                        <div className="border-b border-slate-100 last:border-0">
                            <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100">
                                <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-2">
                                    <Plane className="h-3 w-3" />
                                    IDA
                                </span>
                            </div>
                            <FlightTable segments={ida} />
                        </div>
                    )}

                    {/* VOLTA Section */}
                    {volta.length > 0 && (
                        <div className="border-b border-slate-100 last:border-0">
                            <div className="px-4 py-2 bg-indigo-50/50 border-b border-indigo-100">
                                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                                    <Plane className="h-3 w-3 rotate-180" />
                                    VOLTA
                                </span>
                            </div>
                            <FlightTable segments={volta} />
                        </div>
                    )}
                </div>

                {/* Footer: Class & Baggage */}
                {(segments[0]?.cabin_class || segments[0]?.baggage_included) && (
                    <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-3 text-xs">
                        {segments[0].cabin_class && (
                            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">
                                {segments[0].cabin_class}
                            </span>
                        )}
                        {segments[0].baggage_included && (
                            <span className="text-emerald-600 font-medium">✓ {segments[0].baggage_included}</span>
                        )}
                    </div>
                )}

                {/* Selection Indicator */}
                {isSelected && (
                    <div className="px-4 py-2 bg-emerald-500 text-white text-center text-sm font-semibold">
                        ✓ Selecionado
                    </div>
                )}
            </button>

            {/* ==================== MODAL: FULL ITINERARY ==================== */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowModal(false)}
                    />

                    {/* Modal */}
                    <div className="relative bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden shadow-2xl">
                        {/* Header */}
                        <div className={cn(
                            "flex items-center justify-between px-4 py-4 border-b",
                            isSelected ? "bg-emerald-50" : "bg-gradient-to-r from-sky-50 to-indigo-50"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                    isSelected ? "bg-emerald-100" : "bg-sky-100"
                                )}>
                                    <Plane className={cn(
                                        "h-5 w-5",
                                        isSelected ? "text-emerald-600" : "text-sky-600"
                                    )} />
                                </div>
                                <div>
                                    <span className="font-semibold text-slate-800 block">
                                        {item.title || 'Itinerário Aéreo'}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {segments.length} trecho{segments.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
                            >
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="overflow-y-auto max-h-[60vh]">
                            {/* IDA Section */}
                            {ida.length > 0 && (
                                <div className="border-b border-slate-100">
                                    <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100">
                                        <span className="text-xs font-bold text-sky-700 uppercase tracking-wide flex items-center gap-2">
                                            <Plane className="h-3 w-3" />
                                            IDA
                                        </span>
                                    </div>
                                    <FlightTableMobile segments={ida} />
                                </div>
                            )}

                            {/* VOLTA Section */}
                            {volta.length > 0 && (
                                <div className="border-b border-slate-100">
                                    <div className="px-4 py-2 bg-indigo-50/50 border-b border-indigo-100">
                                        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-2">
                                            <Plane className="h-3 w-3 rotate-180" />
                                            VOLTA
                                        </span>
                                    </div>
                                    <FlightTableMobile segments={volta} />
                                </div>
                            )}

                            {/* Footer info */}
                            {(segments[0]?.cabin_class || segments[0]?.baggage_included) && (
                                <div className="px-4 py-3 bg-slate-50 flex items-center gap-3 text-xs">
                                    {segments[0].cabin_class && (
                                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">
                                            {segments[0].cabin_class}
                                        </span>
                                    )}
                                    {segments[0].baggage_included && (
                                        <span className="text-emerald-600 font-medium">✓ {segments[0].baggage_included}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Sticky Footer */}
                        <div className="p-4 border-t bg-white flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs text-slate-500">Total</p>
                                <p className={cn(
                                    "text-2xl font-bold",
                                    isSelected ? "text-emerald-600" : "text-slate-900"
                                )}>
                                    {formatPrice(item.base_price)}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    onToggle()
                                    setShowModal(false)
                                }}
                                className={cn(
                                    "px-6 py-3 rounded-xl font-semibold text-sm transition-all min-h-[48px]",
                                    isSelected
                                        ? "bg-emerald-600 text-white"
                                        : "bg-sky-600 text-white hover:bg-sky-700"
                                )}
                            >
                                {isSelected ? '✓ Selecionado' : 'Selecionar este voo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

// Desktop table - same as before
function FlightTable({ segments }: { segments: FlightSegment[] }) {
    return (
        <div className="w-full">
            {/* Desktop Table Header */}
            <div className="grid grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.5fr_0.8fr_1.5fr_1fr_1fr] gap-2 px-4 py-2 bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <div>Data</div>
                <div>Cia Aérea</div>
                <div>Voo</div>
                <div>Saída</div>
                <div>De</div>
                <div>Chegada</div>
                <div>Para</div>
                <div>Duração</div>
                <div>Conexão</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-50">
                {segments.map((segment, idx) => {
                    const nextSegment = segments[idx + 1]
                    const transitTime = nextSegment
                        ? calculateTransitTime(
                            { date: segment.arrival_date, time: segment.arrival_time },
                            { date: nextSegment.departure_date, time: nextSegment.departure_time }
                        )
                        : null

                    const duration = calculateDuration(
                        { date: segment.departure_date, time: segment.departure_time },
                        { date: segment.arrival_date, time: segment.arrival_time }
                    )

                    const airlineStyle = AIRLINE_COLORS[segment.airline_code] || { bg: 'bg-slate-600', text: 'text-white' }

                    return (
                        <div key={segment.id} className="group hover:bg-slate-50 transition-colors">
                            <div className="grid grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_1.5fr_0.8fr_1.5fr_1fr_1fr] gap-2 px-4 py-3 items-center text-xs text-slate-700">
                                <div className="font-medium text-slate-900">
                                    {formatDate(segment.departure_date)}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                                        airlineStyle.bg, airlineStyle.text
                                    )}>
                                        {segment.airline_code}
                                    </div>
                                    <span className="truncate" title={segment.airline_name}>{segment.airline_name}</span>
                                </div>
                                <div className="font-mono text-slate-500">{segment.flight_number}</div>
                                <div className="font-bold">{formatTime(segment.departure_time)}</div>
                                <div>
                                    <div className="font-medium">{segment.departure_city}</div>
                                    <div className="text-[10px] text-slate-400 font-bold">{segment.departure_airport}</div>
                                </div>
                                <div>
                                    <div className="font-bold">{formatTime(segment.arrival_time)}</div>
                                </div>
                                <div>
                                    <div className="font-medium">{segment.arrival_city}</div>
                                    <div className="text-[10px] text-slate-400 font-bold">{segment.arrival_airport}</div>
                                </div>
                                <div className="text-slate-500">{duration}</div>
                                <div className="text-slate-500 font-medium">
                                    {transitTime ? (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[10px]">
                                            {transitTime}
                                        </span>
                                    ) : '-'}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Mobile table for modal
function FlightTableMobile({ segments }: { segments: FlightSegment[] }) {
    return (
        <div className="divide-y divide-slate-100">
            {segments.map((segment, idx) => {
                const nextSegment = segments[idx + 1]
                const transitTime = nextSegment
                    ? calculateTransitTime(
                        { date: segment.arrival_date, time: segment.arrival_time },
                        { date: nextSegment.departure_date, time: nextSegment.departure_time }
                    )
                    : null

                const duration = calculateDuration(
                    { date: segment.departure_date, time: segment.departure_time },
                    { date: segment.arrival_date, time: segment.arrival_time }
                )

                const airlineStyle = AIRLINE_COLORS[segment.airline_code] || { bg: 'bg-slate-600', text: 'text-white' }

                return (
                    <div key={segment.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold",
                                    airlineStyle.bg, airlineStyle.text
                                )}>
                                    {segment.airline_name}
                                </div>
                                <span className="text-xs text-slate-500 font-mono">#{segment.flight_number}</span>
                            </div>
                            <div className="text-xs font-medium text-slate-900">
                                {formatDate(segment.departure_date)}
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                <div className="text-lg font-bold text-slate-900">{formatTime(segment.departure_time)}</div>
                                <div className="text-xs font-medium text-slate-600">{segment.departure_airport}</div>
                                <div className="text-[10px] text-slate-400 truncate">{segment.departure_city}</div>
                            </div>

                            <div className="flex flex-col items-center px-2">
                                <div className="text-[10px] text-slate-400 mb-1">{duration}</div>
                                <div className="w-16 h-[1px] bg-slate-200 relative">
                                    <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 rotate-90" />
                                </div>
                            </div>

                            <div className="flex-1 text-right">
                                <div className="text-lg font-bold text-slate-900">{formatTime(segment.arrival_time)}</div>
                                <div className="text-xs font-medium text-slate-600">{segment.arrival_airport}</div>
                                <div className="text-[10px] text-slate-400 truncate">{segment.arrival_city}</div>
                            </div>
                        </div>

                        {transitTime && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-amber-700">
                                <Clock className="w-3 h-3" />
                                <span>Conexão de <strong>{transitTime}</strong></span>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default FlightItinerary
