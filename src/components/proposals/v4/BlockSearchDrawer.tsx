/**
 * BlockSearchDrawer - Slide-in drawer for adding items
 *
 * REDESIGNED for better UX:
 * - Shows "Create Empty" option first (most common action)
 * - Library search is secondary
 * - AI extraction for flights
 * - Clear loading/error states
 */

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useLibrarySearch, type LibrarySearchResult, type LibraryCategory } from '@/hooks/useLibrary'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { AIImageExtractor } from '@/components/proposals/AIImageExtractor'
import type { ExtractedItem } from '@/hooks/useAIExtract'
import {
    X,
    Search,
    Plus,
    Building2,
    Plane,
    Ship,
    Car,
    Bus,
    Star,
    Shield,
    Sparkles,
    Loader2,
    Library,
    FileText,
    Image as ImageIcon,
    Video,
    Minus,
    Table,
    Type,
    AlertCircle,
    Globe,
} from 'lucide-react'
import type { BlockType } from '@/pages/ProposalBuilderV4'
import type { ProposalItemType } from '@/types/proposals'
import { createInitialCruiseData } from './cruises/types'
import { createInitialInsuranceData } from './insurance/types'
import { HotelCatalogPicker } from './HotelCatalogPicker'
import { FlightLookupPicker } from './FlightLookupPicker'
import { TransferCatalogPicker } from './TransferCatalogPicker'
import { TourCatalogPicker } from './TourCatalogPicker'
import { CarRentalPicker } from './CarRentalPicker'
import type { HotelDetailsResult } from '@/hooks/useHotelSearch'
import type { FlightLookupResult } from '@/hooks/useFlightLookup'
import type { IterpecTransferResult, IterpecTourResult, IterpecCarResult } from '@/types/iterpec'

interface BlockSearchDrawerProps {
    isOpen: boolean
    blockType: BlockType | null
    sectionId: string | null
    onClose: () => void
}

// Block type to library category map
const BLOCK_TO_LIBRARY_CATEGORY: Partial<Record<BlockType, LibraryCategory>> = {
    hotel: 'hotel',
    flight: 'flight',
    cruise: 'custom',
    car: 'transfer',
    transfer: 'transfer',
    experience: 'experience',
    insurance: 'service',  // Seguros estão na categoria 'service'
    custom: 'custom',
}

// Block type labels
const BLOCK_LABELS: Record<BlockType, string> = {
    hotel: 'Hotel',
    flight: 'Voo',
    cruise: 'Cruzeiro',
    car: 'Carro',
    transfer: 'Transfer',
    experience: 'Experiencia',
    insurance: 'Seguro',
    custom: 'Item',
    title: 'Titulo',
    text: 'Texto',
    image: 'Imagem',
    video: 'Video',
    divider: 'Divisor',
    table: 'Tabela',
}

// Block type icons - FIXED: proper icons for each type
const BLOCK_ICONS: Record<BlockType, React.ElementType> = {
    hotel: Building2,
    flight: Plane,
    cruise: Ship,
    car: Car,
    transfer: Bus,
    experience: Sparkles,
    insurance: Shield,
    custom: Star,
    title: Type,
    text: FileText,
    image: ImageIcon,
    video: Video,
    divider: Minus,
    table: Table,
}

// Block type colors
const BLOCK_COLORS: Record<BlockType, { bg: string; text: string; border: string }> = {
    hotel: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    flight: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
    cruise: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    car: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    transfer: { bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' },
    experience: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    insurance: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
    custom: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    title: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    text: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    image: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    video: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    divider: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    table: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
}

// Block to item type
const BLOCK_TO_ITEM: Record<BlockType, ProposalItemType> = {
    hotel: 'hotel',
    flight: 'flight',
    cruise: 'custom',
    car: 'transfer',
    transfer: 'transfer',
    experience: 'experience',
    insurance: 'insurance',
    custom: 'custom',
    title: 'custom',
    text: 'custom',
    image: 'custom',
    video: 'custom',
    divider: 'custom',
    table: 'custom',
}

// Blocks that support AI extraction
const AI_ENABLED_BLOCKS: BlockType[] = ['flight']

// Blocks that support library search
const LIBRARY_ENABLED_BLOCKS: BlockType[] = ['hotel', 'flight', 'experience', 'transfer', 'insurance']

// Blocks that support external catalog/lookup
const CATALOG_ENABLED_BLOCKS: BlockType[] = ['hotel', 'flight', 'transfer', 'experience', 'car']

type TabType = 'create' | 'library' | 'ai' | 'catalog'

export function BlockSearchDrawer({
    isOpen,
    blockType,
    sectionId,
    onClose,
}: BlockSearchDrawerProps) {
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState<TabType>('create')
    const [isCreating, setIsCreating] = useState(false)
    const { addItemFromLibrary, addItem, updateItem } = useProposalBuilder()

    // Check features for this block type
    const hasAISupport = blockType && AI_ENABLED_BLOCKS.includes(blockType)
    const hasLibrarySupport = blockType && LIBRARY_ENABLED_BLOCKS.includes(blockType)
    const hasCatalogSupport = blockType && CATALOG_ENABLED_BLOCKS.includes(blockType)

    // Get library category for this block type
    const libraryCategory = blockType ? BLOCK_TO_LIBRARY_CATEGORY[blockType] : undefined

    // Search library (only when on library tab and has 2+ chars)
    const { data: results = [], isLoading, error } = useLibrarySearch(
        { search, category: libraryCategory },
        isOpen && search.length >= 2 && activeTab === 'library' && !!hasLibrarySupport
    )

    // Handle creating empty item
    const handleCreateEmpty = useCallback(async () => {
        if (!sectionId || !blockType) return

        setIsCreating(true)
        try {
            const itemType = BLOCK_TO_ITEM[blockType]
            const label = BLOCK_LABELS[blockType]
            const itemId = addItem(sectionId, itemType, `Novo ${label}`)

            // Initialize rich_content for specific block types
            if (blockType === 'cruise') {
                updateItem(itemId, {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    rich_content: { cruise: createInitialCruiseData() } as any
                })
            } else if (blockType === 'insurance') {
                updateItem(itemId, {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    rich_content: { insurance: createInitialInsuranceData() } as any
                })
            }

            onClose()
        } finally {
            setIsCreating(false)
        }
    }, [sectionId, blockType, addItem, updateItem, onClose])

    // Handle selecting a library result
    const handleSelect = useCallback((item: LibrarySearchResult) => {
        if (sectionId) {
            addItemFromLibrary(sectionId, item)
        }
        onClose()
    }, [sectionId, addItemFromLibrary, onClose])

    // Handle AI extraction complete
    const handleAIExtractComplete = useCallback((extractedItems: ExtractedItem[]) => {
        if (!sectionId || !blockType) return

        for (const extracted of extractedItems) {
            const itemType = BLOCK_TO_ITEM[blockType] || 'flight'
            const details = extracted.details || {}
            const segments = (details.segments || []) as Array<Record<string, unknown>>

            // Para voos: converter segments da IA em flights.legs[].options[]
            if (extracted.category === 'flight' && segments.length > 0) {
                const title = extracted.title || `Voo extraído por IA`
                const itemId = addItem(sectionId, 'flight', title)

                // Agrupar segments em IDA e VOLTA (mesma lógica do readFlightData)
                
                let splitIndex = segments.length // tudo é ida por default

                // Procurar ponto de retorno (segment que volta para a origem)
                for (let i = 1; i < segments.length; i++) {
                    const depDate = String(segments[i].departure_date || '')
                    const prevArrDate = String(segments[i - 1].arrival_date || '')
                    if (depDate && prevArrDate && depDate > prevArrDate) {
                        // Gap de dias = provavelmente separação ida/volta
                        const d1 = new Date(prevArrDate).getTime()
                        const d2 = new Date(depDate).getTime()
                        if ((d2 - d1) > 2 * 86400000) { // gap > 2 dias
                            splitIndex = i
                            break
                        }
                    }
                }

                const outboundSegs = segments.slice(0, splitIndex)
                const returnSegs = segments.slice(splitIndex)

                const createLeg = (segs: Array<Record<string, unknown>>, legType: string, label: string) => {
                    const first = segs[0]
                    return {
                        id: `leg-${legType}-${Date.now()}`,
                        leg_type: legType,
                        label,
                        origin_code: String(first.departure_airport || ''),
                        origin_city: String(first.departure_city || ''),
                        destination_code: String(segs[segs.length - 1].arrival_airport || ''),
                        destination_city: String(segs[segs.length - 1].arrival_city || ''),
                        date: String(first.departure_date || ''),
                        ordem: legType === 'outbound' ? 0 : 1,
                        options: [{
                            id: `opt-${legType}-${Date.now()}`,
                            airline_code: String(first.airline_code || ''),
                            airline_name: String(first.airline_name || ''),
                            flight_number: segs.map(s => String(s.flight_number || '')).join(' / '),
                            departure_time: String(first.departure_time || ''),
                            arrival_time: String(segs[segs.length - 1].arrival_time || ''),
                            cabin_class: String(first.cabin_class || 'economy'),
                            equipment: '',
                            stops: segs.length - 1,
                            baggage: String(first.baggage_included || ''),
                            price: Number(first.price) || 0,
                            currency: 'BRL',
                            is_recommended: true,
                            enabled: true,
                            ordem: 0,
                        }],
                    }
                }

                const legs = []
                if (outboundSegs.length > 0) legs.push(createLeg(outboundSegs, 'outbound', 'IDA'))
                if (returnSegs.length > 0) legs.push(createLeg(returnSegs, 'return', 'VOLTA'))

                updateItem(itemId, {
                    base_price: extracted.price || 0,
                    rich_content: {
                        extracted_from_ai: true,
                        flights: {
                            legs,
                            show_prices: true,
                            allow_mix_airlines: true,
                        },
                    },
                })
            } else {
                // Para outros tipos (hotel, transfer, etc): manter formato original
                addItem(sectionId, itemType, extracted.title)
                const sections = useProposalBuilder.getState().sections
                const section = sections.find(s => s.id === sectionId)
                if (section && section.items.length > 0) {
                    const lastItem = section.items[section.items.length - 1]
                    updateItem(lastItem.id, {
                        description: extracted.description || null,
                        base_price: extracted.price || 0,
                        rich_content: {
                            extracted_from_ai: true,
                            location: extracted.location,
                            dates: extracted.dates,
                            category: extracted.category,
                            ...details,
                        },
                    })
                }
            }
        }

        onClose()
    }, [sectionId, blockType, addItem, updateItem, onClose])

    // Handle hotel import from catalog
    // Formato: rich_content.hotel.{hotel_name, star_rating, images, amenities, ...}
    // Alinhado com readHotelData.ts que lê rich_content.hotel namespace
    const handleHotelImport = useCallback((hotel: HotelDetailsResult) => {
        if (!sectionId) return

        const photoUrls = (hotel.photos || []).map(p => p.url).filter(Boolean)

        const itemId = addItem(sectionId, 'hotel', hotel.name)
        updateItem(itemId, {
            image_url: hotel.photos[0]?.url || null,
            rich_content: {
                hotel: {
                    hotel_name: hotel.name,
                    location_city: hotel.city || hotel.address || '',
                    star_rating: hotel.starRating || 0,
                    room_type: '',
                    board_type: '',
                    check_in_date: '',
                    check_out_date: '',
                    check_in_time: '14:00',
                    check_out_time: '12:00',
                    nights: 0,
                    price_per_night: 0,
                    currency: 'BRL',
                    amenities: hotel.amenities || [],
                    cancellation_policy: '',
                    description: hotel.description || '',
                    image_url: hotel.photos[0]?.url || '',
                    images: photoUrls,
                    options: [],
                    // Metadados do catálogo (não usados pelo reader, mas úteis para debug)
                    _catalog: {
                        provider: hotel.provider,
                        external_id: hotel.externalId,
                        guest_rating: hotel.guestRating,
                        reviews_count: hotel.reviewsCount,
                        phone: hotel.phone,
                        website: hotel.website,
                        lat: hotel.lat,
                        lng: hotel.lng,
                    },
                },
            },
        })
        onClose()
    }, [sectionId, addItem, updateItem, onClose])

    // Handle flight import from lookup
    // Formato: rich_content.flights.legs[].options[]
    // Alinhado com readFlightData.ts que lê rich_content.flights namespace
    const handleFlightImport = useCallback((flight: FlightLookupResult) => {
        if (!sectionId) return

        const depTime = flight.departure.scheduledTime
            ? formatTimeFromISO(flight.departure.scheduledTime)
            : ''
        const arrTime = flight.arrival.scheduledTime
            ? formatTimeFromISO(flight.arrival.scheduledTime)
            : ''

        const title = `${flight.airline.name} ${flight.flightNumber}`
        const itemId = addItem(sectionId, 'flight', title)
        updateItem(itemId, {
            rich_content: {
                flights: {
                    legs: [
                        {
                            id: `leg-${Date.now()}`,
                            leg_type: 'outbound',
                            label: 'IDA',
                            origin_code: flight.departure.iata,
                            origin_city: flight.departure.city || '',
                            destination_code: flight.arrival.iata,
                            destination_city: flight.arrival.city || '',
                            date: flight.departureDate,
                            ordem: 0,
                            options: [
                                {
                                    id: `opt-${Date.now()}`,
                                    airline_code: flight.airline.iata,
                                    airline_name: flight.airline.name,
                                    flight_number: flight.flightNumber,
                                    departure_time: depTime,
                                    arrival_time: arrTime,
                                    cabin_class: 'economy',
                                    fare_family: '',
                                    equipment: flight.aircraft || '',
                                    stops: 0,
                                    baggage: '',
                                    price: 0,
                                    currency: 'BRL',
                                    is_recommended: true,
                                    enabled: true,
                                    ordem: 0,
                                },
                            ],
                        },
                    ],
                    show_prices: true,
                    allow_mix_airlines: true,
                    _catalog: {
                        provider: flight.provider,
                        departure_terminal: flight.departure.terminal,
                        arrival_terminal: flight.arrival.terminal,
                        duration_minutes: flight.durationMinutes,
                        status: flight.status,
                    },
                },
            },
        })
        onClose()
    }, [sectionId, addItem, updateItem, onClose])

    // Handle transfer import from Iterpec catalog
    const handleTransferImport = useCallback((transfer: IterpecTransferResult, token: string) => {
        if (!sectionId) return
        const itemId = addItem(sectionId, 'transfer', transfer.name)
        updateItem(itemId, {
            base_price: transfer.price.value,
            rich_content: {
                transfer: {
                    route: `${transfer.vehicleType}`,
                    datetime: '',
                    vehicle: transfer.vehicleType,
                    passengers: String(transfer.maxPassengers),
                    show_route: true,
                    show_datetime: true,
                    show_vehicle: true,
                    show_passengers: true,
                    _iterpec: {
                        provider: 'iterpec_cangooroo',
                        iterpecTransferId: transfer.iterpecTransferId,
                        token,
                        supplierName: transfer.supplierName || '',
                        transferType: transfer.transferType,
                        price_currency: transfer.price.currency,
                        price_value: transfer.price.value,
                        cancellationPolicies: JSON.parse(JSON.stringify(transfer.cancellationPolicies)),
                    },
                },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        })
        onClose()
    }, [sectionId, addItem, updateItem, onClose])

    // Handle tour import from Iterpec catalog
    const handleTourImport = useCallback((tour: IterpecTourResult, token: string) => {
        if (!sectionId) return
        const itemId = addItem(sectionId, 'experience', tour.name)
        updateItem(itemId, {
            base_price: tour.price.value,
            description: tour.description || '',
            rich_content: {
                experience: {
                    name: tour.name,
                    date: '',
                    time: '',
                    duration: tour.duration || '',
                    location: '',
                    meeting_point: '',
                    participants: '',
                    price_type: 'per_person',
                    included: [],
                    provider: tour.supplierName || '',
                    cancellation_policy: '',
                    _iterpec: {
                        provider: 'iterpec_cangooroo',
                        iterpecTourId: tour.iterpecTourId,
                        token,
                        price_currency: tour.price.currency,
                        price_value: tour.price.value,
                        availableDates: tour.availableDates,
                        cancellationPolicies: JSON.parse(JSON.stringify(tour.cancellationPolicies)),
                    },
                },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        })
        onClose()
    }, [sectionId, addItem, updateItem, onClose])

    // Handle car rental import from Iterpec catalog
    const handleCarImport = useCallback((car: IterpecCarResult, token: string) => {
        if (!sectionId) return
        const title = `${car.model} - ${car.rental.name}`
        const itemId = addItem(sectionId, 'transfer', title)
        updateItem(itemId, {
            base_price: car.price.value,
            rich_content: {
                transfer: {
                    route: car.pickup?.Address || '',
                    datetime: '',
                    vehicle: `${car.model} (${car.transmission})`,
                    passengers: String(car.passengers),
                    show_route: true,
                    show_datetime: true,
                    show_vehicle: true,
                    show_passengers: true,
                    _iterpec: {
                        provider: 'iterpec_cangooroo',
                        iterpecCarId: car.iterpecCarId,
                        token,
                        model: car.model,
                        category: car.category,
                        transmission: car.transmission,
                        rental_name: car.rental.name,
                        rental_logoUrl: car.rental.logoUrl || '',
                        rental_sippCode: car.rental.sippCode || '',
                        price_currency: car.price.currency,
                        price_value: car.price.value,
                        cancellationPolicies: JSON.parse(JSON.stringify(car.cancellationPolicies)),
                    },
                },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
        })
        onClose()
    }, [sectionId, addItem, updateItem, onClose])

    // Close drawer and reset
    const handleClose = useCallback(() => {
        setSearch('')
        setActiveTab('create')
        onClose()
    }, [onClose])

    if (!isOpen || !blockType) return null

    const Icon = BLOCK_ICONS[blockType] || Building2
    const label = BLOCK_LABELS[blockType]
    const colors = BLOCK_COLORS[blockType] || BLOCK_COLORS.custom

    // Count available tabs
    const tabCount = 1 + (hasLibrarySupport ? 1 : 0) + (hasAISupport ? 1 : 0) + (hasCatalogSupport ? 1 : 0)

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40 transition-opacity backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Drawer */}
            <div
                className={cn(
                    'fixed right-0 top-0 h-full w-full max-w-md',
                    'bg-white shadow-2xl z-50',
                    'flex flex-col',
                    'transform transition-transform duration-300 ease-out',
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            colors.bg, colors.text
                        )}>
                            <Icon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">
                                Adicionar {label}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {tabCount > 1 ? 'Escolha como adicionar' : 'Preencha os dados'}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="h-10 w-10 rounded-full hover:bg-slate-100"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Tabs - Only show if more than one option */}
                {tabCount > 1 && (
                    <div className="flex border-b border-slate-200 px-2">
                        {/* Create Tab - Always first */}
                        <button
                            onClick={() => setActiveTab('create')}
                            className={cn(
                                'flex-1 py-3 px-3 text-sm font-medium transition-all',
                                'flex items-center justify-center gap-2 rounded-t-lg mx-1',
                                activeTab === 'create'
                                    ? cn('text-white', colors.bg.replace('50', '600'), 'shadow-sm')
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            )}
                            style={activeTab === 'create' ? {
                                backgroundColor: colors.text.includes('emerald') ? '#059669' :
                                    colors.text.includes('sky') ? '#0284c7' :
                                    colors.text.includes('orange') ? '#ea580c' :
                                    colors.text.includes('teal') ? '#0d9488' : '#475569'
                            } : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            Criar Novo
                        </button>

                        {/* Library Tab */}
                        {hasLibrarySupport && (
                            <button
                                onClick={() => setActiveTab('library')}
                                className={cn(
                                    'flex-1 py-3 px-3 text-sm font-medium transition-all',
                                    'flex items-center justify-center gap-2 rounded-t-lg mx-1',
                                    activeTab === 'library'
                                        ? 'text-blue-700 bg-blue-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                )}
                            >
                                <Library className="h-4 w-4" />
                                Biblioteca
                            </button>
                        )}

                        {/* Catalog Tab */}
                        {hasCatalogSupport && (
                            <button
                                onClick={() => setActiveTab('catalog')}
                                className={cn(
                                    'flex-1 py-3 px-3 text-sm font-medium transition-all',
                                    'flex items-center justify-center gap-2 rounded-t-lg mx-1',
                                    activeTab === 'catalog'
                                        ? 'text-indigo-700 bg-indigo-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                )}
                            >
                                <Globe className="h-4 w-4" />
                                Catálogo
                            </button>
                        )}

                        {/* AI Tab */}
                        {hasAISupport && (
                            <button
                                onClick={() => setActiveTab('ai')}
                                className={cn(
                                    'flex-1 py-3 px-3 text-sm font-medium transition-all',
                                    'flex items-center justify-center gap-2 rounded-t-lg mx-1',
                                    activeTab === 'ai'
                                        ? 'text-purple-700 bg-purple-100'
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                )}
                            >
                                <Sparkles className="h-4 w-4" />
                                IA
                            </button>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* CREATE TAB - Default, most common action */}
                    {activeTab === 'create' && (
                        <div className="p-6">
                            <div className={cn(
                                "rounded-2xl border-2 border-dashed p-8 text-center transition-all",
                                colors.border, colors.bg
                            )}>
                                <div className={cn(
                                    "w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center",
                                    colors.text,
                                    colors.bg.replace('50', '100')
                                )}>
                                    <Icon className="h-8 w-8" />
                                </div>

                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    Criar {label} em Branco
                                </h3>
                                <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                                    Adicione um novo {label.toLowerCase()} e preencha os dados manualmente
                                </p>

                                <Button
                                    onClick={handleCreateEmpty}
                                    disabled={isCreating}
                                    size="lg"
                                    className={cn(
                                        "px-8",
                                        colors.text.includes('emerald') && 'bg-emerald-600 hover:bg-emerald-700',
                                        colors.text.includes('sky') && 'bg-sky-600 hover:bg-sky-700',
                                        colors.text.includes('orange') && 'bg-orange-600 hover:bg-orange-700',
                                        colors.text.includes('teal') && 'bg-teal-600 hover:bg-teal-700',
                                    )}
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Criar {label}
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Quick tips */}
                            {hasLibrarySupport && (
                                <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                                    <p className="text-xs text-slate-500">
                                        <strong className="text-slate-700">Dica:</strong> Use a aba "Biblioteca" para buscar itens que voce ja cadastrou anteriormente.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LIBRARY TAB */}
                    {activeTab === 'library' && hasLibrarySupport && (
                        <>
                            {/* Search Input */}
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder={`Buscar ${label.toLowerCase()} na biblioteca...`}
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 h-11 bg-white"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Results Area */}
                            <div className="p-4">
                                {/* Error State */}
                                {error && (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                            <AlertCircle className="h-7 w-7 text-red-500" />
                                        </div>
                                        <p className="text-sm font-medium text-slate-900 mb-1">
                                            Erro ao buscar
                                        </p>
                                        <p className="text-xs text-slate-500 mb-4">
                                            Nao foi possivel carregar a biblioteca
                                        </p>
                                        <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                                            Tentar novamente
                                        </Button>
                                    </div>
                                )}

                                {/* Loading State */}
                                {isLoading && !error && (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
                                        <p className="text-sm text-slate-500">
                                            Buscando "{search}"...
                                        </p>
                                    </div>
                                )}

                                {/* Empty Search State */}
                                {!isLoading && !error && search.length < 2 && (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                            <Library className="h-7 w-7 text-slate-400" />
                                        </div>
                                        <p className="text-sm font-medium text-slate-700 mb-1">
                                            Buscar na biblioteca
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Digite pelo menos 2 caracteres para buscar
                                        </p>
                                    </div>
                                )}

                                {/* No Results */}
                                {!isLoading && !error && search.length >= 2 && results.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                            <Search className="h-7 w-7 text-slate-400" />
                                        </div>
                                        <p className="text-sm font-medium text-slate-700 mb-1">
                                            Nenhum resultado
                                        </p>
                                        <p className="text-xs text-slate-500 mb-4">
                                            Nao encontramos "{search}" na biblioteca
                                        </p>
                                        <Button onClick={() => setActiveTab('create')}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Criar Novo
                                        </Button>
                                    </div>
                                )}

                                {/* Results List */}
                                {!isLoading && !error && results.length > 0 && (
                                    <div className="space-y-2">
                                        {results.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleSelect(item)}
                                                className="w-full p-3 flex items-center gap-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group"
                                            >
                                                {/* Thumbnail */}
                                                <div className="w-14 h-14 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
                                                    {item.thumbnail_url ? (
                                                        <img
                                                            src={item.thumbnail_url}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className={cn(
                                                            "w-full h-full flex items-center justify-center",
                                                            colors.bg, colors.text
                                                        )}>
                                                            <Icon className="h-5 w-5" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-900 truncate group-hover:text-blue-700">
                                                        {item.name}
                                                    </p>
                                                    {item.destination && (
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {item.destination}
                                                        </p>
                                                    )}
                                                    {item.supplier && (
                                                        <p className="text-xs text-slate-400 mt-0.5">
                                                            {item.supplier}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Price */}
                                                {item.base_price && Number(item.base_price) > 0 && (
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-sm font-semibold text-emerald-600">
                                                            {new Intl.NumberFormat('pt-BR', {
                                                                style: 'currency',
                                                                currency: item.currency || 'BRL',
                                                            }).format(Number(item.base_price))}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Arrow */}
                                                <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                                                    <Plus className="h-5 w-5" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* AI TAB */}
                    {activeTab === 'ai' && hasAISupport && (
                        <div className="p-4">
                            <AIImageExtractor
                                onExtractComplete={handleAIExtractComplete}
                            />
                        </div>
                    )}

                    {/* CATALOG TAB */}
                    {activeTab === 'catalog' && hasCatalogSupport && (
                        <div className="p-4">
                            {blockType === 'hotel' && (
                                <HotelCatalogPicker
                                    onImport={handleHotelImport}
                                />
                            )}
                            {blockType === 'flight' && (
                                <FlightLookupPicker
                                    onImport={handleFlightImport}
                                />
                            )}
                            {blockType === 'transfer' && (
                                <TransferCatalogPicker
                                    onImport={handleTransferImport}
                                />
                            )}
                            {blockType === 'experience' && (
                                <TourCatalogPicker
                                    onImport={handleTourImport}
                                />
                            )}
                            {blockType === 'car' && (
                                <CarRentalPicker
                                    onImport={handleCarImport}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

export default BlockSearchDrawer

/** Extrai HH:MM de um ISO timestamp (ex: "2026-07-16 01:50Z" → "01:50") */
function formatTimeFromISO(iso: string): string {
    try {
        // Tenta parsear como Date
        const d = new Date(iso)
        if (!isNaN(d.getTime())) {
            return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
        }
        // Fallback: extrair HH:MM de string tipo "2026-07-16 01:50Z"
        const match = iso.match(/(\d{2}):(\d{2})/)
        return match ? `${match[1]}:${match[2]}` : ''
    } catch {
        return ''
    }
}
