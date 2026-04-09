import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useIterpecCarSearch } from '@/hooks/useIterpecSearch'
import type { IterpecCarCriteria, IterpecCarResult, IterpecSearchResponse } from '@/types/iterpec'
import {
    Search,
    Car,
    Loader2,
    Download,
    Calendar,
    Clock,
    Users,
    Briefcase,
    Snowflake,
} from 'lucide-react'

interface CarRentalPickerProps {
    onImport: (car: IterpecCarResult, token: string) => void
}

export function CarRentalPicker({ onImport }: CarRentalPickerProps) {
    const [pickupCode, setPickupCode] = useState('')
    const [pickupType, setPickupType] = useState('Airport')
    const [pickupDate, setPickupDate] = useState('')
    const [pickupHour, setPickupHour] = useState('10')
    const [dropoffDate, setDropoffDate] = useState('')
    const [dropoffHour, setDropoffHour] = useState('10')
    const [criteria, setCriteria] = useState<IterpecCarCriteria | null>(null)

    const { data, isLoading, error } = useIterpecCarSearch(criteria)
    const response = data as IterpecSearchResponse<IterpecCarResult> | undefined

    const handleSearch = useCallback(() => {
        if (!pickupCode || !pickupDate || !dropoffDate) return
        setCriteria({
            Pickup: {
                Date: pickupDate,
                Hour: parseInt(pickupHour),
                Minutes: 0,
                LocationCode: pickupCode,
                LocationType: pickupType,
            },
            Dropoff: {
                Date: dropoffDate,
                Hour: parseInt(dropoffHour),
                Minutes: 0,
                LocationCode: pickupCode, // Same location by default
                LocationType: pickupType,
            },
        })
    }, [pickupCode, pickupType, pickupDate, pickupHour, dropoffDate, dropoffHour])

    const handleImport = useCallback((car: IterpecCarResult) => {
        onImport(car, response?.token ?? '')
    }, [onImport, response?.token])

    return (
        <div className="space-y-4">
            {/* Search form */}
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Local (código IATA)</label>
                        <Input
                            placeholder="Ex: GRU"
                            value={pickupCode}
                            onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo local</label>
                        <select
                            value={pickupType}
                            onChange={(e) => setPickupType(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        >
                            <option value="Airport">Aeroporto</option>
                            <option value="City_Location">Cidade</option>
                            <option value="Hotel">Hotel</option>
                            <option value="CarRental">Locadora</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Retirada
                        </label>
                        <Input
                            type="date"
                            value={pickupDate}
                            onChange={(e) => setPickupDate(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Hora retirada
                        </label>
                        <Input
                            type="number"
                            min="0"
                            max="23"
                            value={pickupHour}
                            onChange={(e) => setPickupHour(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Devolução
                        </label>
                        <Input
                            type="date"
                            value={dropoffDate}
                            onChange={(e) => setDropoffDate(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Hora devolução
                        </label>
                        <Input
                            type="number"
                            min="0"
                            max="23"
                            value={dropoffHour}
                            onChange={(e) => setDropoffHour(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                </div>
                <Button
                    onClick={handleSearch}
                    disabled={!pickupCode || !pickupDate || !dropoffDate || isLoading}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Buscar carros
                </Button>
            </div>

            {/* Error */}
            {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    {error instanceof Error ? error.message : 'Erro ao buscar carros'}
                </p>
            )}

            {/* Results */}
            {response && response.results.length === 0 && (
                <div className="text-center py-8">
                    <Car className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Nenhum carro encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">Tente outro local ou período</p>
                </div>
            )}

            {response && response.results.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400">{response.results.length} carros encontrados</p>
                    {response.results.map((c) => (
                        <div
                            key={c.externalId}
                            className="p-3 bg-white rounded-xl border border-slate-200 space-y-2"
                        >
                            <div className="flex items-start gap-3">
                                {/* Car image */}
                                <div className="w-20 h-14 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                                    {c.imageUrl ? (
                                        <img
                                            src={c.imageUrl}
                                            alt={c.model}
                                            className="w-full h-full object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                            <Car className="h-5 w-5 text-amber-400" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 text-sm">{c.model}</p>
                                    <p className="text-xs text-slate-500">{c.rental.name}</p>
                                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                                        <span>{c.transmission === 'Manual' ? 'Manual' : 'Auto'}</span>
                                        {c.airConditioning && (
                                            <span className="flex items-center gap-0.5">
                                                <Snowflake className="h-3 w-3" /> AC
                                            </span>
                                        )}
                                        <span className="flex items-center gap-0.5">
                                            <Users className="h-3 w-3" /> {c.passengers}
                                        </span>
                                        <span className="flex items-center gap-0.5">
                                            <Briefcase className="h-3 w-3" /> {c.baggage}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {c.price.currency} {c.price.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[10px] text-slate-400">total</p>
                                </div>
                            </div>
                            <Button
                                onClick={() => handleImport(c)}
                                size="sm"
                                variant="outline"
                                className="w-full text-amber-700 border-amber-200 hover:bg-amber-50"
                            >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Importar carro
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!criteria && (
                <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                        <Car className="h-5 w-5 text-amber-400" />
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Buscar carro na Iterpec</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Preencha local e datas para buscar
                    </p>
                </div>
            )}
        </div>
    )
}
