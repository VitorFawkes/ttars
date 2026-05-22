/**
 * BlockSearchDrawer - Slide-in drawer for adding items
 *
 * REDESIGNED for better UX:
 * - Shows "Create Empty" option first (most common action)
 * - Library search is secondary
 * - AI extraction for flights
 * - Clear loading/error states
 */

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { type LibrarySearchResult, type LibraryCategory } from '@/hooks/useLibrary'
import { CatalogPickerPanel } from '@/components/catalog/CatalogPickerPanel'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { AIImageExtractor } from '@/components/proposals/AIImageExtractor'
import type { ExtractedItem } from '@/hooks/useAIExtract'
import {
    X,
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
} from 'lucide-react'
import type { BlockType } from '@/pages/ProposalBuilderV4'
import type { ProposalItemType } from '@/types/proposals'
import { createInitialCruiseData } from './cruises/types'
import { createInitialInsuranceData } from './insurance/types'
import { createInitialFlightData, type FlightTripType } from './flights/types'
import { HotelCatalogPicker } from './HotelCatalogPicker'
import { TransferCatalogPicker } from './TransferCatalogPicker'
import { TourCatalogPicker } from './TourCatalogPicker'
import { CarRentalPicker } from './CarRentalPicker'
import { DuffelFlightPicker } from './DuffelFlightPicker'
import type { HotelDetailsResult } from '@/hooks/useHotelSearch'
import type { FlightOffer } from '@/hooks/useDuffelFlightSearch'
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
// Voo NÃO entra no catálogo (preços/horários são voláteis — vai e volta a cada busca).
const LIBRARY_ENABLED_BLOCKS: BlockType[] = ['hotel', 'experience', 'transfer', 'insurance']

// Blocks that support external catalog/lookup
const CATALOG_ENABLED_BLOCKS: BlockType[] = ['hotel', 'flight', 'transfer', 'experience', 'car']

type TabType = 'create' | 'library' | 'ai' | 'catalog'

export function BlockSearchDrawer({
    isOpen,
    blockType,
    sectionId,
    onClose,
}: BlockSearchDrawerProps) {
    const [, setSearch] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [flightTripType, setFlightTripType] = useState<FlightTripType>('roundtrip')
    const { addItemFromLibrary, addItem, updateItem } = useProposalBuilder()

    // Check features for this block type
    const hasAISupport = blockType && AI_ENABLED_BLOCKS.includes(blockType)
    const hasLibrarySupport = blockType && LIBRARY_ENABLED_BLOCKS.includes(blockType)
    const hasCatalogSupport = blockType && CATALOG_ENABLED_BLOCKS.includes(blockType)

    // Default tab: se tipo aceita catálogo, abre direto nele (time já tem itens cadastrados).
    // Senão, vai pra "Criar Novo" (textos, divisores, etc).
    const [activeTab, setActiveTab] = useState<TabType>('library')

    // Resetar aba ao abrir/trocar tipo de bloco.
    // Voo: abre na busca ao vivo (Duffel).
    // Hotel/Experiência/Transfer/Seguro: abre no Catálogo.
    // Texto/Divisor/Imagem: abre em Criar Novo.
    useEffect(() => {
        if (isOpen && blockType) {
            if (blockType === 'flight' && hasCatalogSupport) {
                setActiveTab('catalog')
            } else if (hasLibrarySupport) {
                setActiveTab('library')
            } else {
                setActiveTab('create')
            }
        }
    }, [isOpen, blockType, hasLibrarySupport, hasCatalogSupport])

    // Get library category for this block type
    const libraryCategory = blockType ? BLOCK_TO_LIBRARY_CATEGORY[blockType] : undefined

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
            } else if (blockType === 'flight') {
                // Cria voo com a estrutura escolhida pelo wizard
                // (ida-e-volta, só ida ou multi-cidade)
                updateItem(itemId, {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    rich_content: { flights: createInitialFlightData(flightTripType) } as any
                })
            }

            onClose()
        } finally {
            setIsCreating(false)
        }
    }, [sectionId, blockType, addItem, updateItem, onClose, flightTripType])

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

    // Handle flight import from Duffel offer
    // Formato: rich_content.flights.legs[].options[]
    // Alinhado com readFlightData.ts que lê rich_content.flights namespace
    const handleDuffelOfferImport = useCallback((offer: FlightOffer) => {
        if (!sectionId) return

        const pricePerSlice = offer.slices.length > 0
            ? offer.total_amount / offer.slices.length
            : offer.total_amount

        const cabinLabel: Record<string, string> = {
            economy: 'economy',
            premium_economy: 'premium_economy',
            business: 'business',
            first: 'first',
        }

        const ts = Date.now()
        const legs = offer.slices.map((slice, idx) => {
            const firstSeg = slice.segments[0]
            const lastSeg = slice.segments[slice.segments.length - 1]
            const depTime = firstSeg?.departure_datetime
                ? new Date(firstSeg.departure_datetime).toISOString().slice(11, 16)
                : ''
            const arrTime = lastSeg?.arrival_datetime
                ? new Date(lastSeg.arrival_datetime).toISOString().slice(11, 16)
                : ''
            const flightNumbers = slice.segments.map((s) => s.flight_number).filter(Boolean).join(' + ')
            const dateOnly = firstSeg?.departure_datetime
                ? firstSeg.departure_datetime.slice(0, 10)
                : ''

            return {
                id: `leg-${ts}-${idx}`,
                leg_type: idx === 0 ? 'outbound' : 'return',
                label: idx === 0 ? 'IDA' : 'VOLTA',
                origin_code: slice.origin.iata_code,
                origin_city: slice.origin.city_name || '',
                destination_code: slice.destination.iata_code,
                destination_city: slice.destination.city_name || '',
                date: dateOnly,
                ordem: idx,
                options: [
                    {
                        id: `opt-${ts}-${idx}`,
                        airline_code: offer.owner.iata_code,
                        airline_name: offer.owner.name,
                        flight_number: flightNumbers || `${offer.owner.iata_code}—`,
                        departure_time: depTime,
                        arrival_time: arrTime,
                        cabin_class: cabinLabel[offer.cabin_class] ?? 'economy',
                        fare_family: '',
                        equipment: firstSeg?.aircraft || '',
                        stops: slice.stops,
                        baggage: offer.baggage_summary || '',
                        price: Math.round(pricePerSlice * 100) / 100,
                        currency: offer.total_currency,
                        is_recommended: true,
                        enabled: true,
                        ordem: 0,
                        duration_minutes: slice.duration_minutes,
                    },
                ],
            }
        })

        const title = legs.length > 1
            ? `${offer.owner.name} ${legs[0].origin_code} ↔ ${legs[0].destination_code}`
            : `${offer.owner.name} ${legs[0]?.origin_code ?? ''} → ${legs[0]?.destination_code ?? ''}`

        const itemId = addItem(sectionId, 'flight', title)
        updateItem(itemId, {
            base_price: offer.total_amount,
            rich_content: {
                flights: {
                    legs,
                    show_prices: true,
                    allow_mix_airlines: true,
                    _duffel: {
                        provider: 'duffel',
                        offer_id: offer.id,
                        expires_at: offer.expires_at,
                        base_amount: offer.base_amount,
                        tax_amount: offer.tax_amount,
                    },
                },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
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
        setActiveTab(hasLibrarySupport ? 'library' : 'create')
        onClose()
    }, [onClose, hasLibrarySupport])

    if (!isOpen || !blockType) return null

    const Icon = BLOCK_ICONS[blockType] || Building2
    const label = BLOCK_LABELS[blockType]
    const colors = BLOCK_COLORS[blockType] || BLOCK_COLORS.custom

    // Count available tabs
    // Iterpec foi removido como aba (resultados mesclados no Catálogo).
    // Pra voo, a aba "Buscar voos" (Duffel) aparece pq é o método principal.
    const tabCount =
        1 +
        (hasLibrarySupport ? 1 : 0) +
        (hasAISupport ? 1 : 0) +
        (blockType === 'flight' && hasCatalogSupport ? 1 : 0)

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

                        {/* Catálogo Tab (substitui Biblioteca antiga, usa o Catálogo unificado) */}
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
                                Catálogo
                            </button>
                        )}

                        {/* Aba "Buscar voos" só aparece pra voo (Duffel) — pra hotel
                            a busca já mescla LiteAPI inline no Catálogo; pra
                            transfer/tour/car o link "Cotar nova opção ao vivo" no
                            rodapé do catálogo muda o conteúdo do mesmo painel sem
                            virar outra aba. */}
                        {hasCatalogSupport && blockType === 'flight' && (
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
                                <Plane className="h-4 w-4" />
                                Buscar voos
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

                                {/* Wizard de tipo de voo (só pra blockType === 'flight') */}
                                {blockType === 'flight' && (
                                    <div className="mb-5">
                                        <p className="text-xs font-medium text-slate-700 mb-2">Tipo de viagem</p>
                                        <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
                                            {([
                                                { value: 'roundtrip', label: 'Ida e volta', hint: '2 trechos' },
                                                { value: 'oneway', label: 'Só ida', hint: '1 trecho' },
                                                { value: 'multicity', label: 'Multi-cidade', hint: '3+ trechos' },
                                            ] as const).map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => setFlightTripType(opt.value)}
                                                    className={cn(
                                                        "rounded-lg border px-3 py-2 text-left transition-all",
                                                        flightTripType === opt.value
                                                            ? "border-sky-500 bg-sky-50 ring-1 ring-sky-200"
                                                            : "border-slate-200 bg-white hover:border-slate-300"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "text-sm font-medium",
                                                        flightTripType === opt.value ? "text-sky-700" : "text-slate-700"
                                                    )}>
                                                        {opt.label}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

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
                                        <strong className="text-slate-700">Dica:</strong> A aba "Catálogo" tem todos os itens que o time já usou em propostas — pode ser mais rápido que criar do zero.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LIBRARY TAB → agora usa o Catálogo unificado */}
                    {activeTab === 'library' && hasLibrarySupport && (
                        <CatalogPickerPanel
                            category={libraryCategory}
                            label={label}
                            onSelect={handleSelect}
                            onCreateNew={() => setActiveTab('create')}
                            onFallbackIterpec={hasCatalogSupport ? () => setActiveTab('catalog') : undefined}
                        />
                    )}

                    {/* AI TAB */}
                    {activeTab === 'ai' && hasAISupport && (
                        <div className="p-4">
                            <AIImageExtractor
                                onExtractComplete={handleAIExtractComplete}
                            />
                        </div>
                    )}

                    {/* PAINEL DE COTAÇÃO AO VIVO (Iterpec) — sem ser aba.
                        Acessado apenas via "Cotar nova opção ao vivo" no rodapé
                        do CatalogPickerPanel. Header com botão Voltar pro Catálogo.
                        Pra voo, é a aba principal (Duffel) e não tem "voltar". */}
                    {activeTab === 'catalog' && hasCatalogSupport && (
                        <div className="p-4">
                            {blockType !== 'flight' && (
                                <button
                                    onClick={() => setActiveTab('library')}
                                    className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
                                >
                                    ← Voltar ao catálogo
                                </button>
                            )}
                            {blockType === 'hotel' && (
                                <HotelCatalogPicker
                                    onImport={handleHotelImport}
                                />
                            )}
                            {blockType === 'flight' && (
                                <DuffelFlightPicker
                                    onImport={handleDuffelOfferImport}
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
