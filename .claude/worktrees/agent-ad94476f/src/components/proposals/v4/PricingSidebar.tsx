import { useMemo, useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import {
    Save,
    Send,
    Plane,
    Building2,
    Ship,
    Car,
    Sparkles,
    ChevronDown,
    Check,
} from 'lucide-react'
import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'

/**
 * PricingSidebar - Right sidebar with pricing summary
 *
 * Shows:
 * - Elegant currency selector with flags
 * - Total price with visual hierarchy
 * - Breakdown by category with percentages
 * - Save and Send buttons
 *
 * NOTE: Voos são calculados a partir de proposal_items.rich_content.flights
 *       A tabela proposal_flights é apenas um espelho para integração Monde
 */

interface PricingSidebarProps {
    sections: ProposalSectionWithItems[]
}

// Currency configuration with flags
const CURRENCIES = [
    { code: 'BRL' as const, symbol: 'R$', name: 'Real', flag: '🇧🇷', locale: 'pt-BR' },
    { code: 'USD' as const, symbol: 'US$', name: 'Dólar', flag: '🇺🇸', locale: 'en-US' },
    { code: 'EUR' as const, symbol: '€', name: 'Euro', flag: '🇪🇺', locale: 'de-DE' },
]

// Category icons
const CATEGORY_ICONS: Record<string, React.ElementType> = {
    flights: Plane,
    hotels: Building2,
    cruise: Ship,
    transfers: Car,
    experiences: Sparkles,
}

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
    flights: 'Voos',
    hotels: 'Hospedagem',
    cruise: 'Cruzeiro',
    transfers: 'Transfers',
    experiences: 'Experiências',
}

// Category colors for visual differentiation
const CATEGORY_COLORS: Record<string, string> = {
    flights: 'bg-sky-100 text-sky-600',
    hotels: 'bg-emerald-100 text-emerald-600',
    cruise: 'bg-blue-100 text-blue-600',
    transfers: 'bg-teal-100 text-teal-600',
    experiences: 'bg-orange-100 text-orange-600',
}

// Helper to calculate item price (supports flights with legs/options)
function getItemPrice(item: ProposalItemWithOptions): number {
    const richContent = item.rich_content as Record<string, unknown> | null

    // For flights, calculate from legs/options
    if (item.item_type === 'flight') {
        const flights = richContent?.flights as { legs?: Array<{ options?: Array<{ price?: number; is_recommended?: boolean }> }> } | undefined

        if (flights?.legs) {
            const total = flights.legs.reduce((sum, leg) => {
                if (!leg.options || leg.options.length === 0) return sum
                // Get recommended option or first one
                const recommended = leg.options.find(o => o.is_recommended) || leg.options[0]
                return sum + (recommended?.price || 0)
            }, 0)
            if (total > 0) return total
        }
        // Fallback to base_price
        return item.base_price || 0
    }

    // For hotels, calculate from rich_content including options
    if (item.item_type === 'hotel') {
        const hotel = richContent?.hotel as {
            price_per_night?: number
            nights?: number
            options?: Array<{ price_delta?: number; is_recommended?: boolean }>
        } | undefined

        if (hotel && hotel.price_per_night) {
            const nights = Math.max(1, hotel.nights || 1)
            const basePrice = (hotel.price_per_night || 0) * nights

            // Add selected option's price_delta if exists
            const selectedOption = hotel.options?.find(o => o.is_recommended)
            const optionDelta = selectedOption ? (selectedOption.price_delta || 0) * nights : 0

            return basePrice + optionDelta
        }
        // Fallback to base_price
        return item.base_price || 0
    }

    // For experiences, use rich_content price with options
    if (item.item_type === 'experience') {
        const experience = richContent?.experience as {
            price?: number
            participants?: number
            price_type?: string
            options?: Array<{ price?: number; is_recommended?: boolean }>
        } | undefined

        if (experience && experience.price) {
            // If has options and one is recommended, use that price
            const selectedOption = experience.options?.find(o => o.is_recommended)
            if (selectedOption?.price) {
                return selectedOption.price
            }

            // Otherwise calculate from base price
            let basePrice = experience.price || 0
            if (experience.price_type === 'per_person' && experience.participants) {
                basePrice *= experience.participants
            }
            return basePrice
        }
        // Fallback to base_price
        return item.base_price || 0
    }

    // For transfers, use rich_content price with options
    if (item.item_type === 'transfer') {
        const transfer = richContent?.transfer as {
            price?: number
            options?: Array<{ price?: number; is_recommended?: boolean }>
        } | undefined

        if (transfer && transfer.price) {
            // If has options and one is recommended, use that price
            const selectedOption = transfer.options?.find(o => o.is_recommended)
            if (selectedOption?.price) {
                return selectedOption.price
            }
            return transfer.price
        }
        // Fallback to base_price
        return item.base_price || 0
    }

    // For other types, use base_price
    return item.base_price || 0
}

export function PricingSidebar({ sections }: PricingSidebarProps) {
    const { save, publish, isDirty, isSaving, getCurrency, updateCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]

    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Calculate totals by category
    // NOTE: Voos são items com item_type='flight' e rich_content.flights
    //       NÃO soma proposal_flights separadamente (é apenas espelho para Monde)
    const { categoryTotals, grandTotal } = useMemo(() => {
        const totals: Record<string, number> = {}
        let total = 0

        // Sum items from sections (including flights via getItemPrice)
        sections.forEach((section) => {
            // Para items de voo, usa categoria 'flights'
            section.items.forEach((item) => {
                const category = item.item_type === 'flight'
                    ? 'flights'
                    : section.section_type === 'custom'
                        ? 'other'
                        : section.section_type
                const price = getItemPrice(item)
                totals[category] = (totals[category] || 0) + price
                total += price
            })
        })

        return { categoryTotals: totals, grandTotal: total }
    }, [sections])

    // Format currency
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat(currentCurrency.locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value)
    }

    // Get active categories (those with values)
    const activeCategories = Object.entries(categoryTotals)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])

    // Calculate percentage for each category
    const getPercentage = (value: number) => {
        if (grandTotal === 0) return 0
        return Math.round((value / grandTotal) * 100)
    }

    return (
        <div className="w-[280px] flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">
            {/* Header with Currency Selector */}
            <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-900">
                        Resumo
                    </h2>

                    {/* Elegant Currency Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                            <span className="text-base">{currentCurrency.flag}</span>
                            <span className="text-sm font-medium text-slate-700">
                                {currentCurrency.code}
                            </span>
                            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                                {CURRENCIES.map((curr) => (
                                    <button
                                        key={curr.code}
                                        onClick={() => {
                                            updateCurrency(curr.code)
                                            setIsDropdownOpen(false)
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors ${
                                            currency === curr.code ? 'bg-blue-50' : ''
                                        }`}
                                    >
                                        <span className="text-lg">{curr.flag}</span>
                                        <div className="flex-1 text-left">
                                            <span className="text-sm font-medium text-slate-900">
                                                {curr.code}
                                            </span>
                                            <span className="text-xs text-slate-500 ml-1.5">
                                                {curr.name}
                                            </span>
                                        </div>
                                        {currency === curr.code && (
                                            <Check className="h-4 w-4 text-blue-600" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Total - Enhanced Visual */}
            <div className="p-4 border-b border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                    Total da Proposta
                </p>
                <p className="text-3xl font-bold text-emerald-600">
                    {formatCurrency(grandTotal)}
                </p>
                {activeCategories.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                        {activeCategories.length} {activeCategories.length === 1 ? 'categoria' : 'categorias'}
                    </p>
                )}
            </div>

            {/* Breakdown with percentages */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                    Detalhamento
                </p>

                {activeCategories.length > 0 ? (
                    activeCategories.map(([category, value]) => {
                        const Icon = CATEGORY_ICONS[category] || Sparkles
                        const label = CATEGORY_LABELS[category] || 'Outros'
                        const colorClass = CATEGORY_COLORS[category] || 'bg-slate-100 text-slate-600'
                        const percentage = getPercentage(value)

                        return (
                            <div
                                key={category}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-slate-700">
                                            {label}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-900">
                                            {formatCurrency(value)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-slate-300 rounded-full transition-all"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-400 w-8 text-right">
                                            {percentage}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <div className="text-center py-8">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500">
                            Adicione itens para ver o resumo
                        </p>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200 space-y-2 bg-slate-50">
                <Button
                    variant="outline"
                    className="w-full bg-white"
                    onClick={() => save()}
                    disabled={!isDirty || isSaving}
                >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Salvando...' : 'Salvar Rascunho'}
                </Button>
                <Button
                    className="w-full"
                    onClick={() => publish()}
                    disabled={isSaving}
                >
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Proposta
                </Button>
            </div>
        </div>
    )
}

export default PricingSidebar
