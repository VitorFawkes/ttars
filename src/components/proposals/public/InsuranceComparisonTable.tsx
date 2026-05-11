/**
 * InsuranceComparisonTable - Tabela comparativa de seguros viagem
 *
 * Features:
 * - Mobile: Cards horizontais com scroll snap
 * - Desktop: Tabela grid com coberturas
 * - Seleção com visual highlight
 * - Comparação de coberturas (check/x)
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import {
    Shield,
    Check,
    X,
    Heart,
    Briefcase,
    Plane,
    AlertCircle,
    Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice } from './utils'
import { ItemDetailModal } from './ItemDetailModal'

interface Selection {
    selected: boolean
    optionId?: string
    quantity?: number
}

interface InsuranceComparisonTableProps {
    items: ProposalItemWithOptions[]
    selections: Record<string, Selection>
    onSelectItem: (itemId: string) => void
}

// Common coverage types to compare
const COVERAGE_TYPES = [
    { key: 'medical', label: 'Despesas médicas', icon: Heart },
    { key: 'baggage', label: 'Extravio de bagagem', icon: Briefcase },
    { key: 'trip_cancellation', label: 'Cancelamento de viagem', icon: X },
    { key: 'flight_delay', label: 'Atraso de voo', icon: Plane },
    { key: 'dental', label: 'Assistência odontológica', icon: Heart },
    { key: 'repatriation', label: 'Regresso sanitário', icon: Plane },
]

const TIER_LABELS: Record<string, string> = {
    basic: 'Básico',
    standard: 'Standard',
    premium: 'Premium',
    platinum: 'Platinum',
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    basic: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    standard: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
    premium: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
    platinum: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
}

export function InsuranceComparisonTable({
    items,
    selections,
    onSelectItem,
}: InsuranceComparisonTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [activeIndex, setActiveIndex] = useState(0)
    const [detailItem, setDetailItem] = useState<ProposalItemWithOptions | null>(null)

    // Normalize insurance data from rich_content
    const insurances = useMemo(() => {
        return items.map(item => {
            const rc = (item.rich_content as Record<string, any>) || {}
            const coverages = rc.coverages || []

            // Map coverages to coverage types
            const hasCoverage = (type: string): boolean => {
                const lowerCoverages = coverages.map((c: string) => c.toLowerCase())
                switch (type) {
                    case 'medical':
                        return lowerCoverages.some((c: string) =>
                            c.includes('médic') || c.includes('hospitalar')
                        )
                    case 'baggage':
                        return lowerCoverages.some((c: string) =>
                            c.includes('bagagem') || c.includes('extravio')
                        )
                    case 'trip_cancellation':
                        return lowerCoverages.some((c: string) =>
                            c.includes('cancelamento')
                        )
                    case 'flight_delay':
                        return lowerCoverages.some((c: string) =>
                            c.includes('atraso')
                        )
                    case 'dental':
                        return lowerCoverages.some((c: string) =>
                            c.includes('odonto') || c.includes('dental')
                        )
                    case 'repatriation':
                        return lowerCoverages.some((c: string) =>
                            c.includes('regresso') || c.includes('repatria') || c.includes('translado')
                        )
                    default:
                        return false
                }
            }

            return {
                id: item.id,
                name: item.title || rc.name || 'Seguro Viagem',
                provider: rc.provider || 'Seguradora',
                tier: rc.tier || 'standard',
                tierLabel: TIER_LABELS[rc.tier as keyof typeof TIER_LABELS] || rc.tier || 'Standard',
                medicalCoverage: rc.medical_coverage || 0,
                medicalCurrency: rc.medical_coverage_currency || 'USD',
                coverages,
                coverageMap: Object.fromEntries(
                    COVERAGE_TYPES.map(t => [t.key, hasCoverage(t.key)])
                ),
                travelers: rc.travelers || 2,
                price: Number(item.base_price) || 0,
                pricePerPerson: rc.price_type === 'per_person'
                    ? Number(item.base_price)
                    : (Number(item.base_price) || 0) / (rc.travelers || 2),
                priceType: rc.price_type || 'total',
                currency: rc.currency || 'BRL',
                isRecommended: item.is_default_selected,
            }
        })
    }, [items])

    // Card width for scroll calculations (mobile)
    const cardWidth = 320

    // Track active card on scroll
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const handleScroll = () => {
            const index = Math.round(el.scrollLeft / cardWidth)
            setActiveIndex(Math.min(index, insurances.length - 1))
        }

        el.addEventListener('scroll', handleScroll, { passive: true })
        return () => el.removeEventListener('scroll', handleScroll)
    }, [insurances.length, cardWidth])

    const formatMedicalCoverage = (value: number, currency = 'USD') => {
        if (value >= 1000) {
            return `${currency} ${(value / 1000).toFixed(0)}k`
        }
        return formatPrice(value, currency)
    }

    // If less than 2 insurances, don't show comparison
    if (insurances.length < 2) {
        return null
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                    <p className="font-medium text-slate-900">Compare os Seguros</p>
                    <p className="text-xs text-slate-500">
                        {insurances.length} opções disponíveis
                    </p>
                </div>
            </div>

            {/* Mobile: Horizontal scroll cards - COMPACT DESIGN */}
            <div className="md:hidden relative">
                {/* Scrollable container - NO ARROWS, just swipe */}
                <div
                    ref={scrollRef}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 px-4 py-3"
                    role="list"
                    aria-label="Comparação de seguros"
                >
                    {insurances.map((insurance) => {
                        const isSelected = selections[insurance.id]?.selected ?? false
                        const tierColor = TIER_COLORS[insurance.tier] || TIER_COLORS.standard
                        // Count positive coverages
                        const positiveCoverages = Object.values(insurance.coverageMap).filter(Boolean).length

                        return (
                            <div
                                key={insurance.id}
                                className={cn(
                                    'flex-shrink-0 w-[calc(100vw-48px)] max-w-[320px] snap-center rounded-2xl overflow-hidden shadow-lg transition-all duration-200',
                                    isSelected
                                        ? 'ring-2 ring-emerald-500 bg-white'
                                        : 'bg-white border border-slate-200'
                                )}
                                role="listitem"
                                aria-selected={isSelected}
                            >
                                {/* COMPACT Header with tier + price overlay */}
                                <div className={cn(
                                    'relative px-3 py-3',
                                    tierColor.bg
                                )}>
                                    {/* Tier badge + Recommended */}
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'px-2.5 py-1 rounded-full text-xs font-bold bg-white/80',
                                            tierColor.text
                                        )}>
                                            {insurance.tierLabel}
                                        </span>
                                        {insurance.isRecommended && (
                                            <span className="px-2 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full shadow">
                                                ✓ Recomendado
                                            </span>
                                        )}
                                    </div>

                                    {/* Selection indicator - top right */}
                                    <div className={cn(
                                        'absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all',
                                        isSelected
                                            ? 'bg-emerald-600'
                                            : 'bg-white/80 border-2 border-slate-300'
                                    )}>
                                        {isSelected && <Check className="h-4 w-4 text-white" />}
                                    </div>

                                    {/* Medical coverage highlight */}
                                    <div className="mt-2">
                                        <p className="text-xs text-slate-600">Cobertura médica até</p>
                                        <p className={cn('text-2xl font-bold', tierColor.text)}>
                                            {formatMedicalCoverage(insurance.medicalCoverage, insurance.medicalCurrency)}
                                        </p>
                                    </div>
                                </div>

                                {/* COMPACT Content */}
                                <div className="p-3">
                                    {/* Name + Provider */}
                                    <h3 className="font-semibold text-slate-900 line-clamp-1">
                                        {insurance.name}
                                    </h3>
                                    <p className="text-xs text-slate-500">{insurance.provider}</p>

                                    {/* Coverage summary - compact chips */}
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
                                            {positiveCoverages} coberturas
                                        </span>
                                        {insurance.coverageMap.medical && (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                                                Médica
                                            </span>
                                        )}
                                        {insurance.coverageMap.baggage && (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                                                Bagagem
                                            </span>
                                        )}
                                        {insurance.coverageMap.trip_cancellation && (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                                                Cancelamento
                                            </span>
                                        )}
                                    </div>

                                    {/* Price inline */}
                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
                                        <div>
                                            <span className={cn(
                                                'text-lg font-bold',
                                                isSelected ? 'text-emerald-600' : 'text-slate-900'
                                            )}>
                                                {formatPrice(insurance.price, insurance.currency)}
                                            </span>
                                            <p className="text-xs text-slate-500">
                                                {insurance.travelers} viajantes
                                            </p>
                                        </div>
                                    </div>

                                    {/* Ver mais button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            const originalItem = items.find(i => i.id === insurance.id)
                                            if (originalItem) setDetailItem(originalItem)
                                        }}
                                        className="mt-2 w-full text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center justify-center gap-1 py-1"
                                    >
                                        <Info className="h-3 w-3" />
                                        Ver detalhes completos
                                    </button>
                                </div>

                                {/* COMPACT Footer with CTA - ALWAYS VISIBLE */}
                                <div className="px-3 pb-3">
                                    <button
                                        onClick={() => onSelectItem(insurance.id)}
                                        className={cn(
                                            'w-full py-2.5 rounded-xl font-semibold text-sm transition-all min-h-[44px]',
                                            isSelected
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-slate-100 text-slate-700 hover:bg-emerald-50'
                                        )}
                                        aria-pressed={isSelected}
                                    >
                                        {isSelected ? '✓ Selecionado' : 'Selecionar'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Dots indicator */}
                <div className="flex justify-center gap-1.5 pb-3">
                    {insurances.map((insurance, index) => (
                        <div
                            key={insurance.id}
                            className={cn(
                                'h-2 rounded-full transition-all duration-200',
                                index === activeIndex
                                    ? 'bg-emerald-600 w-4'
                                    : selections[insurance.id]?.selected
                                        ? 'bg-emerald-400 w-2'
                                        : 'bg-slate-300 w-2'
                            )}
                        />
                    ))}
                </div>
            </div>

            {/* Desktop: Full table grid */}
            <div className="hidden md:block overflow-x-auto">
                <table
                    className="w-full min-w-[600px]"
                    role="table"
                    aria-label="Comparação de seguros"
                >
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="w-40 px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 sticky left-0">
                                Cobertura
                            </th>
                            {insurances.map(insurance => {
                                const isSelected = selections[insurance.id]?.selected ?? false
                                const tierColor = TIER_COLORS[insurance.tier] || TIER_COLORS.standard
                                return (
                                    <th
                                        key={insurance.id}
                                        className={cn(
                                            'px-4 py-3 text-center transition-all duration-200',
                                            isSelected && 'bg-emerald-50/50'
                                        )}
                                    >
                                        <div className="space-y-1">
                                            <span className={cn(
                                                'px-2.5 py-1 rounded-full text-xs font-semibold',
                                                tierColor.bg,
                                                tierColor.text
                                            )}>
                                                {insurance.tierLabel}
                                            </span>
                                            <p className="font-semibold text-slate-900 text-sm">
                                                {insurance.name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {insurance.provider}
                                            </p>
                                        </div>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Medical Coverage Row */}
                        <tr className="border-b border-slate-100">
                            <td className="px-4 py-3 text-sm text-slate-700 bg-slate-50 sticky left-0 font-medium">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    Cobertura Médica
                                </div>
                            </td>
                            {insurances.map(insurance => {
                                const isSelected = selections[insurance.id]?.selected ?? false
                                return (
                                    <td
                                        key={insurance.id}
                                        className={cn(
                                            'px-4 py-3 text-center',
                                            isSelected && 'bg-emerald-50/50'
                                        )}
                                    >
                                        <span className="text-lg font-bold text-emerald-600">
                                            {formatMedicalCoverage(insurance.medicalCoverage, insurance.medicalCurrency)}
                                        </span>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Coverage rows */}
                        {COVERAGE_TYPES.map(coverage => (
                            <tr key={coverage.key} className="border-b border-slate-100">
                                <td className="px-4 py-2 text-sm text-slate-700 bg-slate-50 sticky left-0">
                                    {coverage.label}
                                </td>
                                {insurances.map(insurance => {
                                    const isSelected = selections[insurance.id]?.selected ?? false
                                    const hasCoverage = insurance.coverageMap[coverage.key]
                                    return (
                                        <td
                                            key={insurance.id}
                                            className={cn(
                                                'px-4 py-2 text-center',
                                                isSelected && 'bg-emerald-50/50'
                                            )}
                                        >
                                            {hasCoverage ? (
                                                <Check className="h-5 w-5 text-emerald-500 mx-auto" />
                                            ) : (
                                                <X className="h-5 w-5 text-slate-300 mx-auto" />
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}

                        {/* Price row */}
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 sticky left-0">
                                Preço Total
                            </td>
                            {insurances.map(insurance => {
                                const isSelected = selections[insurance.id]?.selected ?? false
                                return (
                                    <td
                                        key={insurance.id}
                                        className={cn(
                                            'px-4 py-3 text-center',
                                            isSelected && 'bg-emerald-50/50'
                                        )}
                                    >
                                        <p className={cn(
                                            'text-xl font-bold',
                                            isSelected ? 'text-emerald-600' : 'text-slate-900'
                                        )}>
                                            {formatPrice(insurance.price, insurance.currency)}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {insurance.travelers} viajantes
                                        </p>
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Select row */}
                        <tr>
                            <td className="px-4 py-3 bg-slate-50 sticky left-0"></td>
                            {insurances.map(insurance => {
                                const isSelected = selections[insurance.id]?.selected ?? false
                                return (
                                    <td
                                        key={insurance.id}
                                        className={cn(
                                            'px-4 py-3',
                                            isSelected && 'bg-emerald-50/50'
                                        )}
                                    >
                                        <button
                                            onClick={() => onSelectItem(insurance.id)}
                                            className={cn(
                                                'w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200',
                                                isSelected
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-emerald-300'
                                            )}
                                        >
                                            {isSelected ? 'Selecionado' : 'Selecionar'}
                                        </button>
                                    </td>
                                )
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Item Detail Modal */}
            <ItemDetailModal
                item={detailItem}
                isOpen={!!detailItem}
                onClose={() => setDetailItem(null)}
                isSelected={detailItem ? (selections[detailItem.id]?.selected ?? false) : false}
                onSelect={() => {
                    if (detailItem) onSelectItem(detailItem.id)
                }}
            />
        </div>
    )
}

export default InsuranceComparisonTable
