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

interface PricingSidebarProps {
    sections: ProposalSectionWithItems[]
}

const CURRENCIES = [
    { code: 'BRL' as const, symbol: 'R$', name: 'Real', flag: '\u{1F1E7}\u{1F1F7}', locale: 'pt-BR' },
    { code: 'USD' as const, symbol: 'US$', name: 'Dolar', flag: '\u{1F1FA}\u{1F1F8}', locale: 'en-US' },
    { code: 'EUR' as const, symbol: '\u20AC', name: 'Euro', flag: '\u{1F1EA}\u{1F1FA}', locale: 'de-DE' },
]

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    flights: Plane, hotels: Building2, cruise: Ship, transfers: Car, experiences: Sparkles,
}
const CATEGORY_LABELS: Record<string, string> = {
    flights: 'Voos', hotels: 'Hospedagem', cruise: 'Cruzeiro', transfers: 'Transfers', experiences: 'Experiencias',
}
const CATEGORY_COLORS: Record<string, string> = {
    flights: 'bg-sky-100 text-sky-600', hotels: 'bg-emerald-100 text-emerald-600',
    cruise: 'bg-blue-100 text-blue-600', transfers: 'bg-teal-100 text-teal-600',
    experiences: 'bg-orange-100 text-orange-600',
}

function getItemPrice(item: ProposalItemWithOptions): number {
    const rc = item.rich_content as Record<string, unknown> | null

    if (item.item_type === 'flight') {
        const flights = rc?.flights as { legs?: Array<{ options?: Array<{ price?: number; is_recommended?: boolean }> }> } | undefined
        if (flights?.legs) {
            const total = flights.legs.reduce((sum, leg) => {
                if (!leg.options?.length) return sum
                const rec = leg.options.find(o => o.is_recommended) || leg.options[0]
                return sum + (rec?.price || 0)
            }, 0)
            if (total > 0) return total
        }
        return item.base_price || 0
    }

    if (item.item_type === 'hotel') {
        const hotel = rc?.hotel as { price_per_night?: number; nights?: number; options?: Array<{ price_delta?: number; is_recommended?: boolean }> } | undefined
        if (hotel?.price_per_night) {
            const nights = Math.max(1, hotel.nights || 1)
            const base = (hotel.price_per_night || 0) * nights
            const selectedOption = hotel.options?.find(o => o.is_recommended)
            return base + (selectedOption ? (selectedOption.price_delta || 0) * nights : 0)
        }
        return item.base_price || 0
    }

    if (item.item_type === 'experience') {
        const exp = rc?.experience as { price?: number; participants?: number; price_type?: string; options?: Array<{ price?: number; is_recommended?: boolean }> } | undefined
        if (exp?.price) {
            const sel = exp.options?.find(o => o.is_recommended)
            if (sel?.price) return sel.price
            let base = exp.price
            if (exp.price_type === 'per_person' && exp.participants) base *= exp.participants
            return base
        }
        return item.base_price || 0
    }

    if (item.item_type === 'transfer') {
        const tr = rc?.transfer as { price?: number; options?: Array<{ price?: number; is_recommended?: boolean }> } | undefined
        if (tr?.price) {
            const sel = tr.options?.find(o => o.is_recommended)
            return sel?.price || tr.price
        }
        return item.base_price || 0
    }

    return item.base_price || 0
}

export function PricingSidebar({ sections }: PricingSidebarProps) {
    const { save, publish, isDirty, isSaving, getCurrency, updateCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const { categoryTotals, grandTotal } = useMemo(() => {
        const totals: Record<string, number> = {}
        let total = 0
        sections.forEach((section) => {
            section.items.forEach((item) => {
                const cat = item.item_type === 'flight' ? 'flights'
                    : section.section_type === 'custom' ? 'other' : section.section_type
                const price = getItemPrice(item)
                totals[cat] = (totals[cat] || 0) + price
                total += price
            })
        })
        return { categoryTotals: totals, grandTotal: total }
    }, [sections])

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat(currentCurrency.locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)

    const activeCategories = Object.entries(categoryTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    const getPercentage = (value: number) => grandTotal === 0 ? 0 : Math.round((value / grandTotal) * 100)

    return (
        <div className="w-[280px] flex-shrink-0 bg-white border-l border-slate-200 flex flex-col">
            {/* Header + Currency */}
            <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Resumo</h2>
                    <div className="relative" ref={dropdownRef}>
                        <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-xs">
                            <span>{currentCurrency.flag}</span>
                            <span className="font-medium text-slate-700">{currentCurrency.code}</span>
                            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                                {CURRENCIES.map((c) => (
                                    <button
                                        key={c.code}
                                        onClick={() => { updateCurrency(c.code); setIsDropdownOpen(false) }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-sm ${currency === c.code ? 'bg-indigo-50' : ''}`}
                                    >
                                        <span>{c.flag}</span>
                                        <span className="font-medium text-slate-900">{c.code}</span>
                                        {currency === c.code && <Check className="h-3.5 w-3.5 text-indigo-600 ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Total */}
            <div className="p-4 border-b border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Total da Proposta</p>
                <p className="text-2xl font-bold text-emerald-600 tracking-tight">{formatCurrency(grandTotal)}</p>
                {activeCategories.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                        {activeCategories.length} {activeCategories.length === 1 ? 'categoria' : 'categorias'}
                    </p>
                )}
            </div>

            {/* Breakdown */}
            <div className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Detalhamento</p>
                {activeCategories.length > 0 ? (
                    activeCategories.map(([cat, value]) => {
                        const Icon = CATEGORY_ICONS[cat] || Sparkles
                        const label = CATEGORY_LABELS[cat] || 'Outros'
                        const colorClass = CATEGORY_COLORS[cat] || 'bg-slate-100 text-slate-600'
                        const pct = getPercentage(value)
                        return (
                            <div key={cat} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                    <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-700">{label}</span>
                                        <span className="text-xs font-semibold text-slate-900">{formatCurrency(value)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-slate-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[10px] text-slate-400 w-7 text-right">{pct}%</span>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                ) : (
                    <div className="text-center py-8">
                        <Sparkles className="h-5 w-5 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Adicione itens para ver o resumo</p>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-slate-200 space-y-2 bg-slate-50/80">
                <Button variant="outline" className="w-full bg-white text-xs h-9" onClick={() => save()} disabled={!isDirty || isSaving}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {isSaving ? 'Salvando...' : 'Salvar Rascunho'}
                </Button>
                <Button className="w-full text-xs h-9" onClick={() => publish()} disabled={isSaving}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Enviar Proposta
                </Button>
            </div>
        </div>
    )
}
