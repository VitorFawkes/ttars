/**
 * HotelCatalogPicker — Busca hotéis por nome via SerpAPI Google Hotels.
 *
 * Fluxo:
 *  1. Operador digita nome (ex: "Fasano São Paulo")
 *  2. Autocomplete retorna sugestões com thumbnail
 *  3. Operador clica → busca detalhes (fotos HD, amenidades, rating)
 *  4. Operador clica "Importar" → callback onImport com os dados
 *
 * NÃO faz reserva. Apenas enrichment de conteúdo.
 */

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useHotelSearch, useHotelDetails, type HotelDetailsResult } from '@/hooks/useHotelSearch'
import {
    Search,
    Building2,
    Star,
    MapPin,
    Phone,
    Globe,
    Loader2,
    ArrowLeft,
    Download,
    ImageIcon,
} from 'lucide-react'

interface HotelCatalogPickerProps {
    onImport: (hotel: HotelDetailsResult) => void
}

export function HotelCatalogPicker({ onImport }: HotelCatalogPickerProps) {
    const [query, setQuery] = useState('')
    const [selectedToken, setSelectedToken] = useState<string | null>(null)

    const { data: results = [], isLoading: isSearching } = useHotelSearch(query)
    const detailsMutation = useHotelDetails()

    const handleSelectHotel = useCallback(async (externalId: string) => {
        setSelectedToken(externalId)
        detailsMutation.mutate(externalId)
    }, [detailsMutation])

    const handleImport = useCallback(() => {
        if (detailsMutation.data) {
            onImport(detailsMutation.data)
        }
    }, [detailsMutation.data, onImport])

    const handleBack = useCallback(() => {
        setSelectedToken(null)
        detailsMutation.reset()
    }, [detailsMutation])

    // DETAILS VIEW
    if (selectedToken && detailsMutation.data) {
        const hotel = detailsMutation.data
        return (
            <div className="space-y-4">
                {/* Back button */}
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar aos resultados
                </button>

                {/* Hotel header */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Photo gallery */}
                    {hotel.photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 max-h-48 overflow-hidden">
                            {hotel.photos.slice(0, 6).map((photo, i) => (
                                <img
                                    key={i}
                                    src={photo.thumbnailUrl || photo.url}
                                    alt={photo.alt || hotel.name}
                                    className={cn(
                                        "w-full h-24 object-cover",
                                        i === 0 && "col-span-2 row-span-2 h-full"
                                    )}
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                            ))}
                        </div>
                    )}

                    <div className="p-4 space-y-3">
                        {/* Name + rating */}
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                                {hotel.name}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                                {hotel.starRating && (
                                    <span className="flex items-center gap-1">
                                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                        {hotel.starRating} estrelas
                                    </span>
                                )}
                                {hotel.guestRating && (
                                    <span className="font-medium text-emerald-600">
                                        {hotel.guestRating}/5
                                        {hotel.reviewsCount && (
                                            <span className="text-slate-400 font-normal ml-1">
                                                ({hotel.reviewsCount.toLocaleString('pt-BR')} avaliações)
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Address */}
                        {hotel.address && (
                            <div className="flex items-start gap-2 text-sm text-slate-600">
                                <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                                {hotel.address}
                            </div>
                        )}

                        {/* Phone / Website */}
                        <div className="flex items-center gap-4 text-sm">
                            {hotel.phone && (
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Phone className="h-3.5 w-3.5" />
                                    {hotel.phone}
                                </span>
                            )}
                            {hotel.website && (
                                <a
                                    href={hotel.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                    <Globe className="h-3.5 w-3.5" />
                                    Site
                                </a>
                            )}
                        </div>

                        {/* Description */}
                        {hotel.description && (
                            <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">
                                {stripHtml(hotel.description)}
                            </p>
                        )}

                        {/* Amenities */}
                        {hotel.amenities && hotel.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {hotel.amenities.slice(0, 12).map((amenity) => (
                                    <span
                                        key={amenity}
                                        className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                                    >
                                        {amenity}
                                    </span>
                                ))}
                                {hotel.amenities.length > 12 && (
                                    <span className="px-2 py-0.5 text-slate-400 text-xs">
                                        +{hotel.amenities.length - 12}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Photo count */}
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                            <ImageIcon className="h-3.5 w-3.5" />
                            {hotel.photos.length} fotos disponíveis
                        </div>
                    </div>
                </div>

                {/* Import button */}
                <Button
                    onClick={handleImport}
                    size="lg"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                    <Download className="h-4 w-4 mr-2" />
                    Importar dados deste hotel
                </Button>

                <p className="text-xs text-center text-slate-400">
                    Apenas importa informações e fotos. Preço é definido por você no editor.
                </p>
            </div>
        )
    }

    // LOADING DETAILS
    if (selectedToken && detailsMutation.isPending) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                <p className="text-sm text-slate-500">Buscando fotos e detalhes...</p>
            </div>
        )
    }

    // SEARCH VIEW
    return (
        <div className="space-y-4">
            {/* Search input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Nome do hotel (ex: Fasano São Paulo)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10 h-11 bg-white"
                    autoFocus
                />
            </div>

            {/* Search results */}
            {isSearching && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                </div>
            )}

            {!isSearching && query.length >= 3 && results.length === 0 && (
                <div className="text-center py-8">
                    <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                        Nenhum hotel encontrado para "{query}"
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Tente outro nome ou crie manualmente
                    </p>
                </div>
            )}

            {!isSearching && results.length > 0 && (
                <div className="space-y-2">
                    {results.map((hotel) => (
                        <button
                            key={hotel.externalId}
                            onClick={() => handleSelectHotel(hotel.externalId)}
                            className="w-full p-3 flex items-center gap-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group"
                        >
                            {/* Thumbnail */}
                            <div className="w-14 h-14 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                                {hotel.thumbnailUrl ? (
                                    <img
                                        src={hotel.thumbnailUrl}
                                        alt={hotel.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-emerald-50">
                                        <Building2 className="h-5 w-5 text-emerald-400" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 truncate group-hover:text-emerald-700">
                                    {hotel.name}
                                </p>
                                {hotel.address && (
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                        {hotel.address}
                                    </p>
                                )}
                            </div>

                            <Search className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
                        </button>
                    ))}
                </div>
            )}

            {query.length < 3 && (
                <div className="text-center py-8">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                        <Search className="h-6 w-6 text-emerald-400" />
                    </div>
                    <p className="text-sm text-slate-600 font-medium">Buscar hotel no catálogo</p>
                    <p className="text-xs text-slate-400 mt-1">
                        Digite pelo menos 3 caracteres para buscar
                    </p>
                </div>
            )}
        </div>
    )
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim()
}
