import { useState } from 'react'
import { Plane, ArrowRight, Loader2, Search, Plus, Minus, Briefcase } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
    useDuffelFlightSearch,
    formatDuration,
    formatTime,
    formatDate,
    type CabinClass,
    type FlightOffer,
    type FlightSearchSlice,
} from '@/hooks/useDuffelFlightSearch'

interface Props {
    onImport: (offer: FlightOffer) => void
}

const CABIN_OPTIONS: Array<{ value: CabinClass; label: string }> = [
    { value: 'economy', label: 'Econômica' },
    { value: 'premium_economy', label: 'Premium Economy' },
    { value: 'business', label: 'Executiva' },
    { value: 'first', label: 'Primeira Classe' },
]

export function DuffelFlightPicker({ onImport }: Props) {
    const [origin, setOrigin] = useState('')
    const [destination, setDestination] = useState('')
    const [departureDate, setDepartureDate] = useState('')
    const [returnDate, setReturnDate] = useState('')
    const [passengers, setPassengers] = useState(2)
    const [cabin, setCabin] = useState<CabinClass>('economy')
    const [tripType, setTripType] = useState<'roundtrip' | 'oneway'>('roundtrip')
    const search = useDuffelFlightSearch()

    const canSearch =
        origin.trim().length === 3 &&
        destination.trim().length === 3 &&
        !!departureDate &&
        (tripType === 'oneway' || !!returnDate)

    const handleSearch = () => {
        const slices: FlightSearchSlice[] = [
            { origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: departureDate },
        ]
        if (tripType === 'roundtrip' && returnDate) {
            slices.push({
                origin: destination.toUpperCase(),
                destination: origin.toUpperCase(),
                departure_date: returnDate,
            })
        }
        search.mutate({
            slices,
            passengers,
            cabin_class: cabin,
        })
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Formulário compacto */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                {/* Tipo */}
                <div className="flex gap-1">
                    {(['roundtrip', 'oneway'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTripType(t)}
                            className={cn(
                                'rounded-md px-3 py-1 text-xs font-medium transition',
                                tripType === t
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                            )}
                        >
                            {t === 'roundtrip' ? 'Ida e volta' : 'Só ida'}
                        </button>
                    ))}
                </div>

                {/* Rota */}
                <div className="grid grid-cols-2 gap-2">
                    <Field label="De (IATA)">
                        <Input
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                            placeholder="GRU"
                            maxLength={3}
                            className="font-mono uppercase"
                        />
                    </Field>
                    <Field label="Para (IATA)">
                        <Input
                            value={destination}
                            onChange={(e) => setDestination(e.target.value.toUpperCase())}
                            placeholder="DPS"
                            maxLength={3}
                            className="font-mono uppercase"
                        />
                    </Field>
                </div>

                {/* Datas */}
                <div className={cn('grid gap-2', tripType === 'roundtrip' ? 'grid-cols-2' : 'grid-cols-1')}>
                    <Field label="Ida">
                        <Input
                            type="date"
                            value={departureDate}
                            onChange={(e) => setDepartureDate(e.target.value)}
                        />
                    </Field>
                    {tripType === 'roundtrip' && (
                        <Field label="Volta">
                            <Input
                                type="date"
                                value={returnDate}
                                onChange={(e) => setReturnDate(e.target.value)}
                                min={departureDate}
                            />
                        </Field>
                    )}
                </div>

                {/* Passageiros + cabine */}
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Passageiros">
                        <div className="flex h-10 items-center rounded-md border border-slate-200 bg-white">
                            <button
                                onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                                className="flex h-full w-9 items-center justify-center text-slate-500 hover:bg-slate-50"
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="flex-1 text-center text-sm font-medium">{passengers}</span>
                            <button
                                onClick={() => setPassengers((p) => Math.min(9, p + 1))}
                                className="flex h-full w-9 items-center justify-center text-slate-500 hover:bg-slate-50"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </Field>
                    <Field label="Classe">
                        <select
                            value={cabin}
                            onChange={(e) => setCabin(e.target.value as CabinClass)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                        >
                            {CABIN_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Button
                    onClick={handleSearch}
                    disabled={!canSearch || search.isPending}
                    className="w-full"
                    size="sm"
                >
                    {search.isPending ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                        <Search className="mr-1.5 h-4 w-4" />
                    )}
                    Buscar voos
                </Button>
            </div>

            {/* Resultados */}
            {search.isPending && (
                <div className="flex flex-col items-center py-8">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                    <p className="mt-2 text-sm text-slate-500">Cotando voos…</p>
                </div>
            )}

            {search.isError && !search.isPending && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {search.error?.message}
                </div>
            )}

            {search.data && search.data.offers.length === 0 && !search.isPending && (
                <div className="flex flex-col items-center py-8 text-center">
                    <Plane className="h-8 w-8 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">Nenhum voo encontrado</p>
                    <p className="mt-1 text-xs text-slate-500">Tente outras datas ou aeroportos.</p>
                </div>
            )}

            {search.data && search.data.offers.length > 0 && (
                <>
                    <div className="px-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{search.data.offers.length}</span>{' '}
                        opções ordenadas por preço
                    </div>
                    <div className="space-y-2">
                        {search.data.offers.map((offer) => (
                            <OfferRow key={offer.id} offer={offer} onImport={() => onImport(offer)} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs text-slate-600">{label}</span>
            {children}
        </label>
    )
}

function OfferRow({ offer, onImport }: { offer: FlightOffer; onImport: () => void }) {
    const totalFmt = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: offer.total_currency || 'BRL',
        maximumFractionDigits: 0,
    }).format(offer.total_amount)

    return (
        <button
            onClick={onImport}
            className="group flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
        >
            {/* Header: airline + preço */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    {offer.owner.logo_url ? (
                        <img
                            src={offer.owner.logo_url}
                            alt={offer.owner.name}
                            className="h-6 w-6 rounded object-contain"
                        />
                    ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-600">
                            {offer.owner.iata_code}
                        </div>
                    )}
                    <span className="text-sm font-medium text-slate-900">
                        {offer.owner.name}
                    </span>
                </div>
                <div className="text-right">
                    <p className="text-base font-bold text-slate-900">{totalFmt}</p>
                    <p className="text-xs text-slate-500">total</p>
                </div>
            </div>

            {/* Slices (ida / volta) */}
            {offer.slices.map((slice, idx) => (
                <div
                    key={idx}
                    className="flex items-center gap-3 rounded-md bg-slate-50 px-2 py-1.5 text-xs"
                >
                    <span className="font-mono font-semibold text-slate-900">
                        {slice.origin.iata_code}
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <span className="font-mono font-semibold text-slate-900">
                        {slice.destination.iata_code}
                    </span>
                    <span className="text-slate-500">
                        {formatDate(slice.departure_datetime)} ·{' '}
                        {formatTime(slice.departure_datetime)} → {formatTime(slice.arrival_datetime)}
                    </span>
                    <span className="ml-auto text-slate-500">
                        {formatDuration(slice.duration_minutes)}
                        {slice.stops > 0 ? ` · ${slice.stops} parada${slice.stops > 1 ? 's' : ''}` : ' · direto'}
                    </span>
                </div>
            ))}

            {/* Footer: bagagem */}
            {offer.baggage_summary ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Briefcase className="h-3 w-3" />
                    {offer.baggage_summary}
                </div>
            ) : null}
        </button>
    )
}
