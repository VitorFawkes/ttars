/**
 * SmartSection - Intelligent section renderer with auto-detection
 *
 * Auto-detection rules:
 * - 2+ items of same type → Radio buttons (client selects ONE)
 * - All items optional → Toggle switches
 * - Single required item → Display only (no interaction)
 *
 * Grouping:
 * - Hotels: Group by location_city or dates
 * - Experiences: Group by date
 */

import { useMemo } from 'react'
import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import * as LucideIcons from 'lucide-react'
import { SelectableItemCard } from './SelectableItemCard'
import { RadioItemCard } from './RadioItemCard'
import { HotelComparisonTable } from './HotelComparisonTable'
import { InsuranceComparisonTable } from './InsuranceComparisonTable'
import { cn } from '@/lib/utils'

// ============================================
// DATA NORMALIZER - Bridge between Builder V4 and Public Viewers
// ============================================
// Builder V4 saves data in namespaces: rich_content.hotel, rich_content.flights, etc.
// Public viewers expect flat structure: rich_content.location_city, etc.
// This function normalizes the data for display.

export function normalizeItemForViewer(item: ProposalItemWithOptions): ProposalItemWithOptions {
    const rc = (item.rich_content as Record<string, any>) || {}

    // Already normalized or legacy format - return as-is
    if (!rc.hotel && !rc.flights && !rc.experience && !rc.transfer && !rc.cruise && !rc.insurance) {
        return item
    }

    let normalizedRichContent: Record<string, any> = { ...rc }
    let normalizedImageUrl = item.image_url
    let normalizedPrice = item.base_price

    // Normalize HOTEL data
    if (rc.hotel) {
        const h = rc.hotel
        normalizedRichContent = {
            ...normalizedRichContent,
            // Core hotel fields
            hotel_name: h.hotel_name,
            location_city: h.location_city,
            room_type: h.room_type,
            board_type: h.board_type,
            check_in_date: h.check_in_date,
            check_out_date: h.check_out_date,
            check_in_time: h.check_in_time,
            check_out_time: h.check_out_time,
            nights: h.nights,
            star_rating: h.star_rating,
            amenities: h.amenities,
            cancellation_policy: h.cancellation_policy,
            description: h.description,
            notes: h.notes,
            // Price calculation
            price_per_night: h.price_per_night,
            quantity_unit: 'noites',
            // Galeria de imagens
            images: h.images,
        }
        // Use hotel image if item doesn't have one
        if (!normalizedImageUrl && h.image_url) {
            normalizedImageUrl = h.image_url
        }
        // Calculate total price from per-night
        if (h.price_per_night && h.nights) {
            normalizedPrice = h.price_per_night * h.nights
        }
    }

    // Normalize FLIGHTS data
    if (rc.flights) {
        const f = rc.flights
        normalizedRichContent = {
            ...normalizedRichContent,
            // Flight-specific fields
            legs: f.legs,
            segments: f.legs?.[0]?.options?.[0]?.segments || [],
            cabin_class: f.legs?.[0]?.options?.[0]?.segments?.[0]?.cabin_class,
            show_prices: f.show_prices,
            allow_mix_airlines: f.allow_mix_airlines,
        }
    }

    // Normalize EXPERIENCE data
    if (rc.experience) {
        const e = rc.experience
        normalizedRichContent = {
            ...normalizedRichContent,
            // Experience fields
            location_city: e.location_city || e.location,
            subtitle: e.location_city || e.location,
            date: e.date,
            time: e.time,
            duration: e.duration,
            included: e.included,
            participants: e.participants || (e.max_participants ? `Até ${e.max_participants} pessoas` : undefined),
            meeting_point: e.meeting_point,
            cancellation_policy: e.cancellation_policy,
            description: e.description,
            // Campos adicionais
            provider: e.provider,
            age_restriction: e.age_restriction,
            difficulty_level: e.difficulty_level,
        }
        if (!normalizedImageUrl && e.image_url) {
            normalizedImageUrl = e.image_url
        }
        if (e.price) {
            normalizedPrice = e.price
        }
    }

    // Normalize TRANSFER data
    if (rc.transfer) {
        const t = rc.transfer
        normalizedRichContent = {
            ...normalizedRichContent,
            // Transfer fields
            origin: t.origin,
            destination: t.destination,
            subtitle: `${t.origin} → ${t.destination}`,
            date: t.date,
            time: t.time,
            vehicle_type: t.vehicle_type,
            max_passengers: t.max_passengers,
            passengers: t.passengers,
            duration: t.duration,
            description: t.description,
            // Campos de visibilidade
            show_route: t.show_route,
            show_datetime: t.show_datetime,
            show_vehicle: t.show_vehicle,
            show_passengers: t.show_passengers,
        }
        if (!normalizedImageUrl && t.image_url) {
            normalizedImageUrl = t.image_url
        }
        if (t.price) {
            normalizedPrice = t.price
        }
    }

    // Normalize CRUISE data
    if (rc.cruise) {
        const c = rc.cruise
        normalizedRichContent = {
            ...normalizedRichContent,
            // Cruise fields
            cruise_name: c.cruise_name,
            ship_name: c.ship_name,
            cruise_line: c.cruise_line,
            subtitle: c.cruise_line,
            cabin_type: c.cabin_type,
            room_type: c.cabin_type,
            embarkation_date: c.embarkation_date,
            disembarkation_date: c.disembarkation_date,
            check_in_date: c.embarkation_date,
            check_out_date: c.disembarkation_date,
            embarkation_port: c.embarkation_port,
            disembarkation_port: c.disembarkation_port,
            itinerary: c.itinerary,
            board_type: c.board_type,
            description: c.description,
            // Campos adicionais
            passengers: c.passengers,
            nights: c.nights,
            included: c.included,
            cancellation_policy: c.cancellation_policy,
            images: c.images,
        }
        if (!normalizedImageUrl && c.image_url) {
            normalizedImageUrl = c.image_url
        }
        if (c.price) {
            normalizedPrice = c.price
        }
    }

    // Normalize INSURANCE data
    if (rc.insurance) {
        const i = rc.insurance
        normalizedRichContent = {
            ...normalizedRichContent,
            // Insurance fields
            provider: i.provider,
            subtitle: i.provider,
            plan_name: i.plan_name,
            coverage_type: i.coverage_type,
            coverage_amount: i.coverage_amount,
            start_date: i.start_date,
            end_date: i.end_date,
            travelers_count: i.travelers_count,
            participants: i.travelers_count ? `${i.travelers_count} viajantes` : undefined,
            coverages: i.coverages,
            description: i.description,
            // Campos adicionais de cobertura
            coverage_start: i.coverage_start,
            coverage_end: i.coverage_end,
            medical_coverage: i.medical_coverage,
            medical_coverage_currency: i.medical_coverage_currency,
            cancellation_policy: i.cancellation_policy,
        }
        if (i.price_per_person && i.travelers_count) {
            normalizedPrice = i.price_per_person * i.travelers_count
        } else if (i.total_price) {
            normalizedPrice = i.total_price
        }
    }

    return {
        ...item,
        image_url: normalizedImageUrl,
        base_price: normalizedPrice,
        rich_content: normalizedRichContent,
    }
}

// Normalize all items in a section
export function normalizeSection(section: ProposalSectionWithItems): ProposalSectionWithItems {
    return {
        ...section,
        items: section.items.map(normalizeItemForViewer),
    }
}

// Remove emoji from title for cleaner display
function cleanTitle(title: string): string {
    return title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
}

// Section-specific colors for visual differentiation
const SECTION_COLORS: Record<string, { bg: string; icon: string }> = {
    flights: { bg: 'from-sky-50 to-blue-100', icon: 'text-sky-600' },
    hotels: { bg: 'from-amber-50 to-orange-100', icon: 'text-amber-600' },
    experiences: { bg: 'from-purple-50 to-pink-100', icon: 'text-purple-600' },
    transfers: { bg: 'from-emerald-50 to-teal-100', icon: 'text-emerald-600' },
    insurance: { bg: 'from-slate-50 to-gray-100', icon: 'text-slate-600' },
    services: { bg: 'from-indigo-50 to-violet-100', icon: 'text-indigo-600' },
    custom: { bg: 'from-blue-50 to-indigo-100', icon: 'text-blue-600' },
}

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface SmartSectionProps {
    section: ProposalSectionWithItems
    selections: Record<string, Selection>
    onToggleItem: (itemId: string) => void
    onSelectItem: (sectionId: string, itemId: string) => void
    onSelectOption: (itemId: string, optionId: string) => void
    onChangeQuantity?: (itemId: string, quantity: number) => void
}

type DisplayMode = 'selectable' | 'toggleable' | 'display'

// Detect how section should be displayed
function detectDisplayMode(section: ProposalSectionWithItems): DisplayMode {
    const items = section.items
    const config = (section.config as Record<string, any>) || {}

    // If explicitly set to multiple selection, use toggleable mode
    if (config.selection_mode === 'multiple') {
        return 'toggleable'
    }

    // 2+ items = selectable (radio buttons) - exclusive by default
    if (items.length >= 2) {
        // Check if all are of same type (hotel with hotel, flight with flight)
        const types = new Set(items.map(i => i.item_type))
        if (types.size === 1) {
            return 'selectable'
        }
    }

    // All optional = toggleable
    if (items.every(i => i.is_optional)) {
        return 'toggleable'
    }

    // Default: just display
    return 'display'
}

// Group items by context (city, date, etc)
// NOTE: Items should already be normalized before calling this function
interface ItemGroup {
    label: string
    sublabel?: string
    items: ProposalItemWithOptions[]
}

function groupItems(section: ProposalSectionWithItems, normalizedItems: ProposalItemWithOptions[]): ItemGroup[] {
    const items = normalizedItems

    // Hotels: group by city
    if (section.section_type === 'hotels') {
        const byCity = new Map<string, ProposalItemWithOptions[]>()
        items.forEach(item => {
            const rc = (item.rich_content as any) || {}
            // Support both namespaced and flat formats
            const city = rc.location_city || rc.hotel?.location_city || 'Hospedagem'
            if (!byCity.has(city)) byCity.set(city, [])
            byCity.get(city)!.push(item)
        })

        // If only one group, return without grouping
        if (byCity.size <= 1) {
            return [{ label: section.title, items }]
        }

        return Array.from(byCity.entries()).map(([city, cityItems]) => ({
            label: city,
            sublabel: formatDateRange(cityItems),
            items: cityItems
        }))
    }

    // Experiences: group by date
    if (section.section_type === 'custom' && items.some(i => {
        const rc = (i.rich_content as any) || {}
        return rc.date || rc.experience?.date
    })) {
        const byDate = new Map<string, ProposalItemWithOptions[]>()
        items.forEach(item => {
            const rc = (item.rich_content as any) || {}
            const date = rc.date || rc.experience?.date || 'Experiências'
            if (!byDate.has(date)) byDate.set(date, [])
            byDate.get(date)!.push(item)
        })

        if (byDate.size <= 1) {
            return [{ label: section.title, items }]
        }

        return Array.from(byDate.entries()).map(([date, dateItems]) => ({
            label: formatDate(date),
            sublabel: (dateItems[0].rich_content as any)?.location_city,
            items: dateItems
        }))
    }

    // Default: no grouping
    return [{ label: section.title, items }]
}

function formatDateRange(items: ProposalItemWithOptions[]): string | undefined {
    const dates = items
        .map(i => {
            const rc = (i.rich_content as any) || {}
            return rc.check_in_date || rc.hotel?.check_in_date
        })
        .filter(Boolean)
    if (dates.length === 0) return undefined

    try {
        const min = new Date(Math.min(...dates.map((d: string) => new Date(d).getTime())))
        const max = new Date(Math.max(...dates.map((d: string) => new Date(d).getTime())))
        return `${formatDate(min.toISOString())} - ${formatDate(max.toISOString())}`
    } catch {
        return undefined
    }
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr)
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    } catch {
        return dateStr
    }
}

// Detect special block types from rich_content
type SpecialBlockType = 'title' | 'text' | 'divider' | 'image' | 'video' | null

function detectSpecialBlock(section: ProposalSectionWithItems): SpecialBlockType {
    if (section.section_type !== 'custom' || section.items.length !== 1) return null
    const rc = (section.items[0].rich_content as Record<string, any>) || {}
    if (rc.is_title_block) return 'title'
    if (rc.is_text_block) return 'text'
    if (rc.is_divider_block) return 'divider'
    if (rc.is_image_block) return 'image'
    if (rc.is_video_block) return 'video'
    return null
}

// Special block renderers - Premium design, no price, no selection
function TitleBlock({ item }: { item: ProposalItemWithOptions }) {
    return (
        <div className="pt-10 pb-4 px-6">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                {item.title}
            </h2>
            <div className="mt-3 h-1 w-16 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
        </div>
    )
}

function TextBlock({ item }: { item: ProposalItemWithOptions }) {
    const content = ((item.rich_content as Record<string, any>)?.content as string) || ''
    return (
        <div className="py-6 px-6">
            <p className="text-base md:text-lg text-slate-600 leading-relaxed font-light whitespace-pre-wrap">
                {content}
            </p>
        </div>
    )
}

function DividerBlock() {
    return (
        <div className="py-8 px-8">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        </div>
    )
}

function ImageBlock({ item }: { item: ProposalItemWithOptions }) {
    const url = ((item.rich_content as Record<string, any>)?.image_url as string) || ''
    if (!url) return null
    return (
        <div className="py-4">
            <img src={url} alt="" className="w-full rounded-xl" />
        </div>
    )
}

function VideoBlock({ item }: { item: ProposalItemWithOptions }) {
    const url = ((item.rich_content as Record<string, any>)?.video_url as string) || ''
    if (!url) return null

    // Convert YouTube/Vimeo URLs to embed format
    let embedUrl = url
    if (url.includes('youtube.com/watch')) {
        const videoId = new URL(url).searchParams.get('v')
        if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`
    } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1]?.split('?')[0]
        if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`
    } else if (url.includes('vimeo.com/')) {
        const videoId = url.split('vimeo.com/')[1]?.split('?')[0]
        if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`
    }

    return (
        <div className="py-4 aspect-video">
            <iframe
                src={embedUrl}
                className="w-full h-full rounded-xl"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
        </div>
    )
}

export function SmartSection({
    section,
    selections,
    onToggleItem,
    onSelectItem,
    onSelectOption,
    onChangeQuantity,
}: SmartSectionProps) {
    // Normalize items to flatten namespaced data (hotel, flights, etc) to root level
    const normalizedItems = useMemo(
        () => section.items.map(normalizeItemForViewer),
        [section.items]
    )

    // Check for special blocks first (use normalized items)
    const specialType = detectSpecialBlock({ ...section, items: normalizedItems })

    // Render special blocks without header/price/selection
    if (specialType === 'title') return <TitleBlock item={normalizedItems[0]} />
    if (specialType === 'text') return <TextBlock item={normalizedItems[0]} />
    if (specialType === 'divider') return <DividerBlock />
    if (specialType === 'image') return <ImageBlock item={normalizedItems[0]} />
    if (specialType === 'video') return <VideoBlock item={normalizedItems[0]} />

    // Normal section rendering
    const config = SECTION_TYPE_CONFIG[section.section_type]
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.FileText
    const sectionColors = SECTION_COLORS[section.section_type] || SECTION_COLORS.custom

    const displayMode = useMemo(() => detectDisplayMode({ ...section, items: normalizedItems }), [section, normalizedItems])
    const groups = useMemo(() => groupItems(section, normalizedItems), [section, normalizedItems])

    if (section.items.length === 0) return null

    return (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Section Header */}
            <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-white lg:sticky lg:top-12 lg:z-10">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    `bg-gradient-to-br ${sectionColors.bg}`
                )}>
                    <IconComponent className={cn("h-5 w-5", sectionColors.icon)} />
                </div>
                <div className="flex-1">
                    <h2 className="font-semibold text-slate-900">{cleanTitle(section.title)}</h2>
                    {displayMode === 'selectable' && (
                        <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                Obrigatório
                            </span>
                            Escolha 1 opção
                        </p>
                    )}
                    {displayMode === 'toggleable' && (
                        <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                                Opcional
                            </span>
                            {section.items.length} {section.items.length === 1 ? 'item disponível' : 'itens disponíveis'}
                        </p>
                    )}
                </div>
            </header>

            {/* Groups */}
            <div className="divide-y divide-slate-100">
                {/* 1. PRIMEIRO: Insurance comparison table (verifica item_type, independente de section_type) */}
                {normalizedItems.length >= 2 && normalizedItems.every(item => item.item_type === 'insurance') && displayMode === 'selectable' ? (
                    <div className="p-4">
                        <InsuranceComparisonTable
                            items={normalizedItems}
                            selections={Object.fromEntries(
                                normalizedItems.map(item => [item.id, selections[item.id] || { selected: false }])
                            )}
                            onSelectItem={(itemId) => onSelectItem(section.id, itemId)}
                        />
                    </div>
                ) : /* 2. SEGUNDO: Hotel comparison table (verifica section_type) */
                section.section_type === 'hotels' && normalizedItems.length >= 2 && displayMode === 'selectable' ? (
                    <div className="p-4">
                        <HotelComparisonTable
                            items={normalizedItems}
                            selections={Object.fromEntries(
                                normalizedItems.map(item => [item.id, selections[item.id] || { selected: false }])
                            )}
                            onSelectItem={(itemId) => onSelectItem(section.id, itemId)}
                        />
                    </div>
                ) : /* 3. TERCEIRO: Default rendering */ (
                    /* Default rendering with groups */
                    groups.map((group, groupIndex) => (
                        <div key={groupIndex}>
                            {/* Group Header (only if multiple groups) */}
                            {groups.length > 1 && (
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                                    <p className="text-sm font-medium text-slate-700">{group.label}</p>
                                    {group.sublabel && (
                                        <p className="text-xs text-slate-500">{group.sublabel}</p>
                                    )}
                                </div>
                            )}

                            {/* Items in group */}
                            <div className="divide-y divide-slate-50">
                                {group.items.map(item => {
                                    const sel = selections[item.id]

                                    // Radio mode (selectable - 2+ options)
                                    if (displayMode === 'selectable') {
                                        return (
                                            <RadioItemCard
                                                key={item.id}
                                                item={item}
                                                isSelected={sel?.selected ?? false}
                                                selectedOptionId={sel?.optionId}
                                                onSelect={() => onSelectItem(section.id, item.id)}
                                                onSelectOption={(optionId: string) => onSelectOption(item.id, optionId)}
                                                quantity={sel?.quantity}
                                                onChangeQuantity={onChangeQuantity ? (q: number) => onChangeQuantity(item.id, q) : undefined}
                                            />
                                        )
                                    }

                                    // Toggle mode (optional items)
                                    return (
                                        <SelectableItemCard
                                            key={item.id}
                                            item={item}
                                            isSelected={sel?.selected ?? true}
                                            selectedOptionId={sel?.optionId}
                                            onToggle={() => onToggleItem(item.id)}
                                            onSelectOption={(optionId) => onSelectOption(item.id, optionId)}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </section>
    )
}
