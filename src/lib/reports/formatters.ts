const currencyFull = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
})

const numberFull = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
})

const numberDecimal = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
})

export function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
    if (value >= 1_000) return `R$ ${numberFull.format(Math.round(value / 1_000))} mil`
    return currencyFull.format(value)
}

export function formatCurrencyFull(value: number): string {
    return currencyFull.format(value)
}

export function formatNumber(value: number): string {
    return numberFull.format(value)
}

export function formatDecimal(value: number): string {
    return numberDecimal.format(value)
}

export function formatPercent(value: number): string {
    return `${numberDecimal.format(value)}%`
}

export function formatDays(value: number): string {
    if (value === 1) return '1 dia'
    return `${Math.round(value)} dias`
}

/** Auto-format based on label format type */
export function autoFormat(value: unknown, format: 'number' | 'currency' | 'percent' | undefined): string {
    const num = Number(value)
    if (isNaN(num)) return String(value ?? '—')
    switch (format) {
        case 'currency': return formatCurrency(num)
        case 'percent': return formatPercent(num)
        default: return formatNumber(num)
    }
}

/** Format date for chart axis based on granularity */
export function formatDateAxis(dateStr: string, granularity?: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr

    switch (granularity) {
        case 'day':
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        case 'week':
            return `Sem ${getISOWeek(d)}, ${d.toLocaleDateString('pt-BR', { month: 'short' })}`
        case 'quarter': {
            const q = Math.ceil((d.getMonth() + 1) / 3)
            return `T${q} ${d.getFullYear()}`
        }
        case 'year':
            return String(d.getFullYear())
        case 'month':
        default:
            return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    }
}

function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
