/**
 * FlightLookupPicker — Lookup de voo já fechado por número + data.
 *
 * Fluxo:
 *  1. Operador digita código do voo (ex: "LA8084") e seleciona data
 *  2. API retorna dados do voo (companhia, aeroportos, horários)
 *  3. Operador clica "Importar" → callback onImport com os dados
 *
 * NÃO faz reserva. Apenas enriquece proposta com dados do voo JÁ FECHADO.
 */

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useFlightLookup, getAirlineLogoUrl, type FlightLookupResult } from '@/hooks/useFlightLookup'
import {
    Plane,
    Search,
    Loader2,
    Download,
    Clock,
    MapPin,
    AlertCircle,
} from 'lucide-react'

interface FlightLookupPickerProps {
    onImport: (flight: FlightLookupResult) => void
    onCancel: () => void
}

export function FlightLookupPicker({ onImport }: FlightLookupPickerProps) {
    const [flightNumber, setFlightNumber] = useState('')
    const [departureDate, setDepartureDate] = useState('')

    const lookup = useFlightLookup()

    const handleSearch = useCallback(() => {
        if (!flightNumber.trim() || !departureDate) return
        lookup.mutate({ flightNumber: flightNumber.trim(), departureDate })
    }, [flightNumber, departureDate, lookup])

    const handleImport = useCallback(() => {
        if (lookup.data) {
            onImport(lookup.data)
        }
    }, [lookup.data, onImport])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch()
    }, [handleSearch])

    const flight = lookup.data

    return (
        <div className="space-y-4">
            {/* Search form */}
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Código do voo
                    </label>
                    <Input
                        placeholder="Ex: LA8084, G31234, AA100"
                        value={flightNumber}
                        onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                        onKeyDown={handleKeyDown}
                        className="h-11 bg-white font-mono text-base tracking-wider"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Data de partida
                    </label>
                    <Input
                        type="date"
                        value={departureDate}
                        onChange={(e) => setDepartureDate(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="h-11 bg-white"
                    />
                </div>
                <Button
                    onClick={handleSearch}
                    disabled={!flightNumber.trim() || !departureDate || lookup.isPending}
                    className="w-full bg-sky-600 hover:bg-sky-700"
                >
                    {lookup.isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Buscando...
                        </>
                    ) : (
                        <>
                            <Search className="h-4 w-4 mr-2" />
                            Buscar voo
                        </>
                    )}
                </Button>
            </div>

            {/* Not found */}
            {lookup.isSuccess && !flight && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-amber-800">
                        Voo não encontrado
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                        Verifique o código do voo e a data. Voos muito antigos podem
                        não estar disponíveis.
                    </p>
                </div>
            )}

            {/* Flight result */}
            {flight && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Airline header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 border-b border-sky-100">
                        <img
                            src={getAirlineLogoUrl(flight.airline.iata)}
                            alt={flight.airline.name}
                            className="h-8 w-auto"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                            }}
                        />
                        <div>
                            <p className="font-semibold text-slate-900">
                                {flight.airline.name}
                            </p>
                            <p className="text-xs text-slate-500 font-mono">
                                {flight.flightNumber}
                            </p>
                        </div>
                        {flight.status && (
                            <span className="ml-auto px-2 py-0.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600">
                                {flight.status}
                            </span>
                        )}
                    </div>

                    {/* Route */}
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-4">
                            {/* Departure */}
                            <div className="flex-1 text-center">
                                <p className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
                                    {flight.departure.iata}
                                </p>
                                {flight.departure.city && (
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {flight.departure.city}
                                    </p>
                                )}
                                {flight.departure.scheduledTime && (
                                    <p className="text-sm font-medium text-slate-700 mt-1">
                                        {formatTime(flight.departure.scheduledTime)}
                                    </p>
                                )}
                                {flight.departure.terminal && (
                                    <p className="text-xs text-slate-400">
                                        Terminal {flight.departure.terminal}
                                    </p>
                                )}
                            </div>

                            {/* Arrow + duration */}
                            <div className="flex flex-col items-center gap-1">
                                <Plane className="h-5 w-5 text-sky-500" />
                                <div className="h-px w-16 bg-slate-200" />
                                {flight.durationMinutes && (
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                        <Clock className="h-3 w-3" />
                                        {formatDuration(flight.durationMinutes)}
                                    </span>
                                )}
                            </div>

                            {/* Arrival */}
                            <div className="flex-1 text-center">
                                <p className="text-2xl font-bold text-slate-900 tracking-tight font-mono">
                                    {flight.arrival.iata}
                                </p>
                                {flight.arrival.city && (
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {flight.arrival.city}
                                    </p>
                                )}
                                {flight.arrival.scheduledTime && (
                                    <p className="text-sm font-medium text-slate-700 mt-1">
                                        {formatTime(flight.arrival.scheduledTime)}
                                    </p>
                                )}
                                {flight.arrival.terminal && (
                                    <p className="text-xs text-slate-400">
                                        Terminal {flight.arrival.terminal}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Aircraft */}
                        {flight.aircraft && (
                            <div className="flex items-center gap-1 justify-center mt-3 text-xs text-slate-400">
                                <MapPin className="h-3 w-3" />
                                {flight.aircraft}
                            </div>
                        )}
                    </div>

                    {/* Import button */}
                    <div className="px-4 pb-4">
                        <Button
                            onClick={handleImport}
                            size="lg"
                            className="w-full bg-sky-600 hover:bg-sky-700"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Importar dados deste voo
                        </Button>
                        <p className="text-xs text-center text-slate-400 mt-2">
                            Apenas importa informações. Preço é definido por você no editor.
                        </p>
                    </div>
                </div>
            )}

            {/* Help text */}
            {!flight && !lookup.isPending && !lookup.isSuccess && (
                <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <Plane className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">
                        Digite o código do voo que você já fechou (ex: LA8084)
                        e a data de partida para importar os dados automaticamente.
                    </p>
                </div>
            )}
        </div>
    )
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
        return iso
    }
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}min`
    return m === 0 ? `${h}h` : `${h}h${m}`
}
