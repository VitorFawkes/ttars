import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useIterpecTourSearch } from '@/hooks/useIterpecSearch'
import type { IterpecTourCriteria, IterpecTourResult, IterpecSearchResponse } from '@/types/iterpec'
import {
    Search,
    Sparkles,
    Loader2,
    Download,
    Calendar,
    Clock,
    Users,
} from 'lucide-react'

interface TourCatalogPickerProps {
    onImport: (tour: IterpecTourResult, token: string) => void
}

export function TourCatalogPicker({ onImport }: TourCatalogPickerProps) {
    const [cityId, setCityId] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [adults, setAdults] = useState('2')
    const [criteria, setCriteria] = useState<IterpecTourCriteria | null>(null)

    const { data, isLoading, error } = useIterpecTourSearch(criteria)
    const response = data as IterpecSearchResponse<IterpecTourResult> | undefined

    const handleSearch = useCallback(() => {
        if (!cityId || !startDate || !endDate) return
        const adultCount = parseInt(adults)
        setCriteria({
            CityId: cityId,
            InitialServiceDate: startDate,
            FinalServiceDate: endDate,
            NumberOfDays: 1,
            AdultAges: Array.from({ length: adultCount }, () => 30),
        })
    }, [cityId, startDate, endDate, adults])

    const handleImport = useCallback((tour: IterpecTourResult) => {
        onImport(tour, response?.token ?? '')
    }, [onImport, response?.token])

    return (
        <div className="space-y-4">
            {/* Search form */}
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">ID da cidade (Iterpec)</label>
                    <Input
                        placeholder="Ex: 1010481"
                        value={cityId}
                        onChange={(e) => setCityId(e.target.value)}
                        className="h-9 bg-white text-sm"
                    />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Data início
                        </label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Data fim
                        </label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
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
                            max="10"
                            value={adults}
                            onChange={(e) => setAdults(e.target.value)}
                            className="h-9 bg-white text-sm"
                        />
                    </div>
                </div>
                <Button
                    onClick={handleSearch}
                    disabled={!cityId || !startDate || !endDate || isLoading}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Buscar tours
                </Button>
            </div>

            {/* Error */}
            {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    {error instanceof Error ? error.message : 'Erro ao buscar tours'}
                </p>
            )}

            {/* Results */}
            {response && response.results.length === 0 && (
                <div className="text-center py-8">
                    <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Nenhum tour encontrado</p>
                    <p className="text-xs text-slate-400 mt-1">Tente outra cidade ou período</p>
                </div>
            )}

            {response && response.results.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-slate-400">{response.results.length} tours encontrados</p>
                    {response.results.map((t) => (
                        <div
                            key={t.externalId}
                            className="p-3 bg-white rounded-xl border border-slate-200 space-y-2"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-900 text-sm">{t.name}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                        {t.duration && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {t.duration}
                                            </span>
                                        )}
                                        {t.supplierName && (
                                            <span>{t.supplierName}</span>
                                        )}
                                    </div>
                                    {t.description && (
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                                    )}
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
                                className="w-full text-orange-700 border-orange-200 hover:bg-orange-50"
                            >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Importar tour
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!criteria && (
                <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-5 w-5 text-orange-400" />
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Buscar tours na Iterpec</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Preencha cidade e período para buscar
                    </p>
                </div>
            )}
        </div>
    )
}
