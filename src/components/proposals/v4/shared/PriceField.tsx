/**
 * PriceField - Componente padronizado para exibição de preço
 *
 * Usado por todos os editores para consistência visual
 * Suporta: preço por pessoa/total, moeda global, cálculo automático
 */

import { cn } from '@/lib/utils'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'

export type PriceType = 'per_person' | 'total' | 'per_night' | 'per_unit'

interface PriceFieldProps {
    price: number
    onChange: (price: number) => void
    priceType?: PriceType
    onPriceTypeChange?: (type: PriceType) => void
    quantity?: number // pessoas, noites, unidades
    quantityLabel?: string // "pessoa", "noite", "unidade"
    accentColor?: 'sky' | 'emerald' | 'orange' | 'teal' | 'indigo' | 'violet' | 'amber'
    showPriceTypeSelector?: boolean
    compact?: boolean
    className?: string
}

const ACCENT_STYLES: Record<string, { bg: string; border: string; text: string; textBold: string }> = {
    sky: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-600', textBold: 'text-sky-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', textBold: 'text-emerald-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', textBold: 'text-orange-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-600', textBold: 'text-teal-700' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', textBold: 'text-indigo-700' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-600', textBold: 'text-violet-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', textBold: 'text-amber-700' },
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    BRL: 'R$',
    USD: 'US$',
    EUR: '€',
    GBP: '£',
}

export function PriceField({
    price,
    onChange,
    priceType = 'total',
    onPriceTypeChange,
    quantity = 1,
    quantityLabel = 'pessoa',
    accentColor = 'violet',
    showPriceTypeSelector = false,
    compact = false,
    className,
}: PriceFieldProps) {
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'
    const styles = ACCENT_STYLES[accentColor]

    const isPerUnit = priceType === 'per_person' || priceType === 'per_night' || priceType === 'per_unit'
    const total = isPerUnit ? price * Math.max(1, quantity) : price

    if (compact) {
        return (
            <div className={cn("flex items-center gap-1", className)}>
                <span className={cn("text-sm font-medium", styles.text)}>{currencySymbol}</span>
                <input
                    type="number"
                    value={price || ''}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    step="0.01"
                    className={cn(
                        "w-20 text-sm font-bold text-right bg-transparent border-none outline-none",
                        styles.textBold
                    )}
                />
            </div>
        )
    }

    return (
        <div className={cn("p-3 rounded-lg border", styles.bg, styles.border, className)}>
            {/* Price Type Selector */}
            {showPriceTypeSelector && onPriceTypeChange && (
                <div className="flex items-center gap-4 mb-2">
                    <label className="text-xs font-medium text-slate-600">Tipo:</label>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={priceType === 'per_person' || priceType === 'per_night' || priceType === 'per_unit'}
                                onChange={() => onPriceTypeChange('per_person')}
                                className={cn("focus:ring-2", `text-${accentColor}-600`, `focus:ring-${accentColor}-500`)}
                            />
                            <span className="text-sm text-slate-600">Por {quantityLabel}</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                checked={priceType === 'total'}
                                onChange={() => onPriceTypeChange('total')}
                                className={cn("focus:ring-2", `text-${accentColor}-600`, `focus:ring-${accentColor}-500`)}
                            />
                            <span className="text-sm text-slate-600">Total</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Price Input */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", styles.textBold)}>{currencySymbol}</span>
                    <input
                        type="number"
                        value={price || ''}
                        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        step="0.01"
                        className={cn(
                            "w-28 text-sm font-semibold bg-white border rounded px-2 py-1 outline-none focus:ring-2 text-right",
                            styles.textBold,
                            styles.border,
                            `focus:ring-${accentColor}-500`
                        )}
                    />
                    {isPerUnit && (
                        <span className={cn("text-sm", styles.text)}>/{quantityLabel}</span>
                    )}
                </div>

                {/* Total calculation */}
                {isPerUnit && quantity > 1 && (
                    <div className="flex-1 text-right">
                        <span className={cn("text-sm", styles.text)}>× {quantity} = </span>
                        <span className={cn("text-lg font-bold", styles.textBold)}>
                            {currencySymbol} {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

/**
 * InlinePriceField - Versão inline para uso em linhas de opções
 */
interface InlinePriceFieldProps {
    price: number
    onChange: (price: number) => void
    disabled?: boolean
    className?: string
}

export function InlinePriceField({
    price,
    onChange,
    disabled = false,
    className,
}: InlinePriceFieldProps) {
    const { getCurrency } = useProposalBuilder()
    const currency = getCurrency()
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'R$'

    return (
        <div className={cn("flex items-center gap-1 text-sm text-slate-500", className)}>
            <span>{currencySymbol}</span>
            <input
                type="number"
                value={price || ''}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                className={cn(
                    "w-20 text-right bg-transparent border-none outline-none",
                    disabled && "text-slate-400"
                )}
                placeholder="0"
                step="0.01"
                disabled={disabled}
            />
        </div>
    )
}

export default PriceField
