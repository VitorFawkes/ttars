import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useIterpecTransferSearch } from '@/hooks/useIterpecSearch'
import type { IterpecTransferCriteria, IterpecTransferResult, IterpecSearchResponse } from '@/types/iterpec'
import {
    Search,
    Bus,
    Users,
    Loader2,
    Download,
    Calendar,
    Clock,
    MapPin,
} from 'lucide-react'

interface TransferCatalogPickerProps {
    onImport: (transfer: IterpecTransferResult, token: string) => void
}

export function TransferCatalogPicker({ onImport }: TransferCatalogPickerProps) {
    const [pickupCode, setPickupCode] = useState('')
    const [pickupType, setPickupType] = useState('Airport')
    const [dropoffCode, setDropoffCode] = useState('')
    const [dropoffType, setDropoffType] = useState('City_Location')
    const [date, setDate] = useState('')
    const [hour, setHour] = useState('10')
    const [minutes] = useState('00')
    const [adults, setAdults] = useState('2')
    const [criteria, setCriteria] = useState<IterpecTransferCriteria | null>(null)

    const { data, isLoading, error } = useIterpecTransferSearch(criteria)
    const response = data as IterpecSearchResponse<IterpecTransferResult> | undefined

    const handleSearch = useCallback(() => {
        if (!pickupCode || !dropoffCode || !date) return
        setCriteria({
            Pickup: { LocationCode: parseInt(pickupCode), LocationType: pickupType },
            Dropoff: { LocationCode: parseInt(dropoffCode), LocationType: dropoffType },
            ServiceDate: date,
            Hour: parseInt(hour),
            Minutes: parseInt(minutes),
            NumberOfAdults: parseInt(adults),
        })
    }, [pickupCode, pickupType, dropoffCode, dropoffType, date, hour, minutes, adults])

    const handleImport = useCallback((transfer: IterpecTransferResult) => {
        onImport(transfer, response?.token ?? '')
    }, [onImport, response?.token])

    return (
        <div className="space-y-4">
            {/* Search form */}
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Pickup (ID destino)</label>
                        <Input
                            placeholder="Ex: 7953"
                            value={pickupCode}
                            onChange={(e) => setPickupCode(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo pickup</label>
                        <select
                            value={pickupType}
                            onChange={(e) => setPickupType(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        >
                            <option value="Airport">Aeroporto</option>
                            <option value="City_Location">Cidade</option>
                            <option value="Hotel">Hotel</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Dropoff (ID destino)</label>
                        <Input
                            placeholder="Ex: 7953"
                            value={dropoffCode}
                            onChange={(e) => setDropoffCode(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Tipo dropoff</label>
                        <select
                            value={dropoffType}
                            onChange={(e) => setDropoffType(e.target.value)}
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                        >
                            <option value="Airport">Aeroporto</option>
                            <option value="City_Location">Cidade</option>
                            <option value="Hotel">Hotel</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Data
                        </label>
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Hora
                        </label>
                        <Input
                            type="number"
                            min="0"
                            max="23"
                            value={hour}
                            onChange={(e) => setHour(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Users className="h-3 w-3" /> Adultos
                        </label>
                        <Input
                            type="number"
                            min="1"
                            max="20"
                            value={adults}
                            onChange={(e) => setAdults(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                </div>
                <Button
                    onClick={handleSearch}
                    disabled={!pickupCode || !dropoffCode || !date || isLoading}
                    className="w-full bg-teal-600 hover:bg-teal-700"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Buscar transfers
                </Button>
            </div>

            {/* Error */}
            {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    {error instanceof Error ? error.message : 'Erro ao buscar transfers'}
                </p>
            )}

            {/* Results */}
            {response && response.results.length === 0 && (
                <div className="text-center py-8">
                    <Bus className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Nenhum transfer encontrado</p>
                </div>
            )}

            {response && response.results.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400">{response.results.length} transfers encontrados</p>
                    {response.results.map((t) => (
                        <div
                            key={t.externalId}
                            className="p-3 bg-white rounded-xl border border-slate-200 space-y-2"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 text-sm truncate">{t.name}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                        <span className="flex items-center gap-1">
                                            <Bus className="h-3 w-3" />
                                            {t.vehicleType}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            Até {t.maxPassengers} pax
                                        </span>
                                        {t.supplierName && (
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {t.supplierName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                    <p className="text-sm font-semibold text-slate-900">
                                        {t.price.currency} {t.price.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                            <Button
                                onClick={() => handleImport(t)}
                                size="sm"
                                variant="outline"
                                className="w-full text-teal-700 border-teal-200 hover:bg-teal-50"
                            >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Importar transfer
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!criteria && (
                <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-3">
                        <Bus className="h-5 w-5 text-teal-400" />
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Buscar transfer na Iterpec</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Preencha origem, destino e data para buscar
                    </p>
                </div>
            )}
        </div>
    )
}
