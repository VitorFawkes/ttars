/**
 * ProposalMobileViewer V3 - Premium Client Proposal View
 * 
 * Features:
 * - Hero section with destination image
 * - Sticky section navigation
 * - Responsive: mobile-first with desktop sidebar
 * - Glass footer with total
 * - Scroll tracking for active section
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { ProposalFull, ProposalSectionWithItems } from '@/types/proposals'
import { ProposalHero } from './ProposalHero'
import { SectionNav } from './SectionNav'
import { SmartSection, normalizeSection } from './SmartSection'
import { AcceptProposalModal } from './AcceptProposalModal'
import { Plane, Building2, Bus, Star, Shield, Briefcase, FileText } from 'lucide-react'
import { toast } from 'sonner'

// Section icons map (reserved for future use)
// @ts-expect-error Reserved for future use
const _SECTION_ICONS: Record<string, React.ElementType> = {
    flights: Plane,
    hotels: Building2,
    transfers: Bus,
    experiences: Star,
    insurance: Shield,
    services: Briefcase,
    custom: FileText,
}

// Hook for animated number counter
function useAnimatedNumber(value: number, duration = 300) {
    const [display, setDisplay] = useState(value)
    const animationRef = useRef<number | undefined>(undefined)

    useEffect(() => {
        const start = display
        const diff = value - start
        if (Math.abs(diff) < 1) {
            setDisplay(value)
            return
        }

        const startTime = performance.now()

        const tick = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
            setDisplay(start + diff * eased)
            if (progress < 1) {
                animationRef.current = requestAnimationFrame(tick)
            }
        }

        animationRef.current = requestAnimationFrame(tick)
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
        }
    }, [value, duration])

    return Math.round(display)
}

interface ProposalMobileViewerProps {
    proposal: ProposalFull
    forceMobile?: boolean
}

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

// Multi-currency config
const CURRENCY_RATES: Record<string, number> = {
    USD: 1,
    BRL: 5.0,
    EUR: 0.92,
}

export function ProposalMobileViewer({ proposal, forceMobile = false }: ProposalMobileViewerProps) {
    const version = proposal.active_version
    const rawSections = version?.sections || []

    // Normalize all sections to flatten namespaced data (hotel, flights, etc)
    const sections = useMemo<ProposalSectionWithItems[]>(
        () => rawSections.map(normalizeSection),
        [rawSections]
    )

    // Refs for scroll tracking
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const containerRef = useRef<HTMLDivElement>(null)
    const [activeSection, setActiveSection] = useState<string>('')

    // Primary currency from version metadata or default
    const primaryCurrency = (version?.metadata as any)?.currency || 'USD'
    const showSecondary = (version?.metadata as any)?.show_secondary_currency !== false
    const secondaryCurrency = primaryCurrency === 'USD' ? 'BRL' : 'USD'

    // Get hero image from cover section or first item with image
    const heroImage = useMemo(() => {
        const coverSection = sections.find(s => s.section_type === 'cover')
        if (coverSection?.items?.[0]?.image_url) {
            return coverSection.items[0].image_url
        }
        // Fallback to first item with image
        for (const section of sections) {
            for (const item of section.items || []) {
                if (item.image_url) return item.image_url
            }
        }
        return undefined
    }, [sections])

    // Get trip dates and travelers from metadata
    const travelDates = (version?.metadata as any)?.travel_dates
    const travelers = (version?.metadata as any)?.travelers

    // Track selections
    const [selections, setSelections] = useState<Record<string, Selection>>(() => {
        const initial: Record<string, Selection> = {}

        sections.forEach(section => {
            const items = section.items
            const hasMultiple = items.length >= 2

            items.forEach((item, idx) => {
                if (hasMultiple) {
                    initial[item.id] = {
                        selected: idx === 0 || item.is_default_selected,
                        quantity: 1,
                    }
                } else if (item.is_optional) {
                    initial[item.id] = {
                        selected: item.is_default_selected || false,
                        quantity: 1,
                    }
                } else {
                    initial[item.id] = {
                        selected: true,
                        quantity: 1,
                    }
                }
            })
        })

        return initial
    })

    // Scroll tracking for active section - uses container scroll
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleScroll = () => {
            const offsets = Object.entries(sectionRefs.current)
                .filter(([_, el]) => el !== null)
                .map(([id, el]) => ({
                    id,
                    top: el!.getBoundingClientRect().top
                }))
                .filter(({ top }) => top < 200)
                .sort((a, b) => b.top - a.top)

            if (offsets.length > 0) {
                setActiveSection(offsets[0].id)
            }
        }

        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [])

    // Scroll to section with offset for sticky nav
    const handleSectionClick = useCallback((sectionId: string) => {
        const el = sectionRefs.current[sectionId]
        if (el) {
            const offset = 70 // altura do SectionNav sticky
            const y = el.getBoundingClientRect().top + window.scrollY - offset
            window.scrollTo({ top: y, behavior: 'smooth' })
        }
    }, [])

    // Selection handlers
    const handleToggleItem = useCallback((itemId: string) => {
        setSelections(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId],
                selected: !prev[itemId]?.selected
            }
        }))
    }, [])

    const handleSelectItem = useCallback((sectionId: string, itemId: string) => {
        const section = sections.find(s => s.id === sectionId)
        if (section) {
            setSelections(prev => {
                const next = { ...prev }
                section.items.forEach(item => {
                    next[item.id] = {
                        ...next[item.id],
                        selected: item.id === itemId
                    }
                })
                return next
            })
        }
    }, [sections])

    const handleSelectOption = useCallback((itemId: string, optionId: string) => {
        setSelections(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], optionId }
        }))
    }, [])

    const handleChangeQuantity = useCallback((itemId: string, quantity: number) => {
        setSelections(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], quantity: Math.max(1, quantity) }
        }))
    }, [])

    // Calculate totals
    const { totalPrimary, totalSecondary } = useMemo(() => {
        let sum = 0

        sections.forEach(section => {
            section.items.forEach(item => {
                const sel = selections[item.id]
                if (sel?.selected) {
                    const basePrice = Number(item.base_price) || 0
                    const quantity = sel.quantity || 1

                    let optionDelta = 0
                    if (sel.optionId && item.options) {
                        const option = item.options.find(o => o.id === sel.optionId)
                        if (option) {
                            optionDelta = Number(option.price_delta) || 0
                        }
                    }

                    sum += (basePrice + optionDelta) * quantity
                }
            })
        })

        const rate = CURRENCY_RATES[secondaryCurrency] / CURRENCY_RATES[primaryCurrency]

        return {
            totalPrimary: sum,
            totalSecondary: sum * rate
        }
    }, [sections, selections, primaryCurrency, secondaryCurrency])

    // Format currency
    const formatCurrency = (amount: number, currency: string) =>
        new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency,
        }).format(amount)

    // Helper: detect special content blocks (title, text, divider, etc.)
    const isSpecialBlock = (section: typeof sections[0]) => {
        if (section.section_type !== 'custom' || section.items.length !== 1) return false
        const rc = (section.items[0]?.rich_content as Record<string, any>) || {}
        return rc.is_title_block || rc.is_text_block || rc.is_divider_block ||
            rc.is_image_block || rc.is_video_block
    }

    // Content sections for tabs (exclude cover AND special blocks)
    const contentSections = sections.filter(s =>
        s.section_type !== 'cover' && !isSpecialBlock(s)
    )

    // Summary items for desktop sidebar (only items with price > 0)
    const summaryItems = useMemo(() => {
        return sections.flatMap(section =>
            section.items
                .filter(item => Number(item.base_price) > 0)  // Only items with actual price
                .map(item => ({
                    id: item.id,
                    title: item.title,
                    price: Number(item.base_price) || 0,
                    quantity: selections[item.id]?.quantity || 1,
                    imageUrl: item.image_url,
                    sectionTitle: section.title,
                    sectionType: section.section_type,
                }))
        )
    }, [sections, selections])

    // Modal state
    const [showAcceptModal, setShowAcceptModal] = useState(false)

    // Animated total for premium feel
    const animatedTotal = useAnimatedNumber(totalPrimary)

    // Selected items for modal summary
    const selectedItemsForModal = useMemo(() => {
        return sections.flatMap(section =>
            section.items
                .filter(item => selections[item.id]?.selected)
                .map(item => {
                    const sel = selections[item.id]
                    const selectedOption = sel?.optionId
                        ? item.options?.find(o => o.id === sel.optionId)
                        : null
                    const basePrice = Number(item.base_price) || 0
                    const optionDelta = selectedOption ? Number(selectedOption.price_delta) || 0 : 0

                    return {
                        id: item.id,
                        title: item.title,
                        image_url: item.image_url,
                        price: basePrice + optionDelta,
                        quantity: sel?.quantity || 1,
                        optionLabel: selectedOption?.option_label,
                        sectionTitle: section.title,
                    }
                })
        )
    }, [sections, selections])

    // Validate selections before accepting
    const validateSelections = useCallback(() => {
        const errors: string[] = []

        contentSections.forEach(section => {
            const sectionItems = section.items || []
            const hasSelection = sectionItems.some(item => selections[item.id]?.selected)

            // Seções com 2+ items são obrigatórias (radio) - precisa escolher uma
            if (sectionItems.length >= 2 && !hasSelection) {
                errors.push(`Selecione uma opção em "${section.title}"`)
            }
        })

        return errors
    }, [contentSections, selections])

    // Handle opening accept modal with validation
    const handleOpenAcceptModal = useCallback(() => {
        const errors = validateSelections()
        if (errors.length > 0) {
            toast.error(errors[0])
            return
        }
        setShowAcceptModal(true)
    }, [validateSelections])

    // Calculate section completion status
    const { completedSections, incompleteSections } = useMemo(() => {
        const completed: string[] = []
        const incomplete: string[] = []

        contentSections.forEach(section => {
            const sectionItems = section.items
            const hasSelection = sectionItems.some(item => selections[item.id]?.selected)

            // Seções com 2+ items são obrigatórias (radio)
            if (sectionItems.length >= 2) {
                if (hasSelection) {
                    completed.push(section.id)
                } else {
                    incomplete.push(section.id)
                }
            } else {
                // Seções opcionais/single item sempre consideradas "completas"
                completed.push(section.id)
            }
        })

        return { completedSections: completed, incompleteSections: incomplete }
    }, [contentSections, selections])

    // Count selected vs total items for progress (reserved for future use)
    // @ts-expect-error Reserved for future use
    const _selectedCount = useMemo(() => {
        return Object.values(selections).filter(s => s.selected).length
    }, [selections])
    // @ts-expect-error Reserved for future use
    const _totalItemCount = Object.keys(selections).length

    return (
        <div ref={containerRef} className="h-screen overflow-y-auto bg-slate-50">
            {/* Left content - Main scrollable area */}
            <div className={forceMobile ? "mr-0" : "lg:mr-[340px]"}>
                {/* Hero Section */}
                <ProposalHero
                    title={version?.title || 'Sua Viagem'}
                    subtitle="Proposta Exclusiva"
                    imageUrl={heroImage}
                    dates={travelDates}
                    travelers={travelers}
                />

                {/* Section Navigation */}
                <SectionNav
                    sections={contentSections.map(s => ({
                        id: s.id,
                        title: s.title,
                        section_type: s.section_type,
                    }))}
                    activeSection={activeSection}
                    completedSections={completedSections}
                    incompleteSections={incompleteSections}
                    onSectionClick={handleSectionClick}
                />

                {/* Content Sections */}
                <div className={`px-4 sm:px-6 py-6 space-y-8 ${forceMobile ? "pb-32" : "pb-32 lg:pb-8"}`}>
                    {contentSections.map(section => (
                        <div
                            key={section.id}
                            ref={el => { sectionRefs.current[section.id] = el }}
                            id={`section-${section.id}`}
                        >
                            <SmartSection
                                section={section}
                                selections={selections}
                                onToggleItem={handleToggleItem}
                                onSelectItem={handleSelectItem}
                                onSelectOption={handleSelectOption}
                                onChangeQuantity={handleChangeQuantity}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Desktop Summary Sidebar - Fixed position (hidden in forceMobile mode) */}
            <div className={forceMobile ? "hidden" : "hidden lg:block fixed top-0 right-0 h-screen w-[340px] border-l border-slate-200 bg-white shadow-xl"}>
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-900">Resumo da Viagem</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            {summaryItems.filter(item => selections[item.id]?.selected).length} itens selecionados
                        </p>
                    </div>

                    {/* Scrollable Items List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {summaryItems.filter(item => selections[item.id]?.selected).length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <p className="text-sm">Nenhum item selecionado</p>
                            </div>
                        ) : (
                            summaryItems.filter(item => selections[item.id]?.selected).map(item => (
                                <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                    {/* Image or Icon */}
                                    {item.imageUrl ? (
                                        <img
                                            src={item.imageUrl}
                                            alt={item.title}
                                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-14 h-14 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">{item.sectionTitle}</p>
                                        <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                                        {(selections[item.id]?.quantity || 1) > 1 && (
                                            <p className="text-xs text-slate-500">Qtd: {selections[item.id]?.quantity}</p>
                                        )}
                                    </div>

                                    {/* Price */}
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-bold text-emerald-600">
                                            {formatCurrency(item.price * (selections[item.id]?.quantity || 1), primaryCurrency)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer with Total */}
                    <div className="p-6 border-t border-slate-200 bg-white">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-base font-medium text-slate-600">Total</span>
                            <div className="text-right">
                                <span className="text-2xl font-bold text-slate-900">
                                    {formatCurrency(totalPrimary, primaryCurrency)}
                                </span>
                                {showSecondary && (
                                    <p className="text-xs text-slate-500">
                                        ≈ {formatCurrency(totalSecondary, secondaryCurrency)}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleOpenAcceptModal}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-xl transition-colors text-lg shadow-lg shadow-emerald-600/20"
                        >
                            Confirmar Proposta
                        </button>
                        <p className="text-center text-xs text-slate-400 mt-3">Esta ação não gera cobranças</p>
                    </div>
                </div>
            </div>

            {/* Mobile Sticky Footer - Hidden on desktop (shown in forceMobile mode) */}
            <div
                className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${forceMobile ? "" : "lg:hidden"}`}
                style={{ transform: totalPrimary > 0 ? 'translateY(0)' : 'translateY(100%)' }}
            >
                {/* Glass blur backdrop */}
                <div className="absolute inset-0 bg-white/80 backdrop-blur-lg border-t border-slate-200" />

                <div className="relative px-4 py-3 safe-area-inset-bottom">
                    {/* Total display */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-slate-600">Total</span>
                        <div className="text-right">
                            <p className="text-xl font-bold text-slate-900 tabular-nums">
                                {formatCurrency(animatedTotal, primaryCurrency)}
                            </p>
                            {showSecondary && (
                                <p className="text-xs text-slate-500">
                                    ≈ {formatCurrency(totalSecondary, secondaryCurrency)}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* CTA Button - Green for confirmation */}
                    <button
                        onClick={handleOpenAcceptModal}
                        className="w-full px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-600/25"
                    >
                        Confirmar Proposta
                    </button>
                </div>
            </div>



            {/* Accept Proposal Modal */}
            <AcceptProposalModal
                isOpen={showAcceptModal}
                onClose={() => setShowAcceptModal(false)}
                proposalId={proposal.id}
                versionId={version?.id || ''}
                total={totalPrimary}
                currency={primaryCurrency}
                selections={selections}
                selectedItems={selectedItemsForModal}
            />
        </div>
    )
}
