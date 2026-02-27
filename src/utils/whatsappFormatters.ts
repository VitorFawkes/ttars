// ── Shared formatters for Analytics ──

export const fmt = (n: number) => n.toLocaleString('pt-BR')

export function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export function formatCurrencyFull(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export function formatMinutes(m: number | null | undefined): string {
    if (m == null || m < 0) return '—'
    if (m < 1) return '< 1 min'
    if (m < 60) return `${Math.round(m)} min`
    const h = Math.floor(m / 60)
    const mins = Math.round(m % 60)
    return mins > 0 ? `${h}h ${mins}min` : `${h}h`
}

export function formatHours(h: number | null | undefined): string {
    if (h == null || h < 0) return '—'
    if (h < 1) return '< 1h'
    if (h < 24) return `${Math.round(h)}h`
    const d = Math.floor(h / 24)
    const rem = Math.round(h % 24)
    return rem > 0 ? `${d}d ${rem}h` : `${d}d`
}

export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function formatPeriodLabel(v: string, gran: string): string {
    if (gran === 'month') {
        const [year, month] = v.split('-')
        const idx = parseInt(month, 10) - 1
        return `${MONTH_SHORT[idx] ?? month}/${year.slice(2)}`
    }
    const parts = v.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`
    return v
}

/**
 * Formats a raw phone number into Brazilian display format.
 * 5511964293533 → +55 (11) 96429-3533
 */
export function formatPhone(raw: string | null | undefined): string {
    if (!raw) return ''
    const digits = raw.replace(/\D/g, '')
    // Brazilian mobile: 55 + DDD(2) + 9-digit phone
    if (digits.length === 13 && digits.startsWith('55')) {
        const ddd = digits.slice(2, 4)
        const phone = digits.slice(4)
        return `+55 (${ddd}) ${phone.slice(0, 5)}-${phone.slice(5)}`
    }
    // Brazilian landline: 55 + DDD(2) + 8-digit phone
    if (digits.length === 12 && digits.startsWith('55')) {
        const ddd = digits.slice(2, 4)
        const phone = digits.slice(4)
        return `+55 (${ddd}) ${phone.slice(0, 4)}-${phone.slice(4)}`
    }
    // International with country code
    if (digits.length > 10) {
        return `+${digits.slice(0, 2)} ${digits.slice(2)}`
    }
    return raw
}

export function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Formats "time since" for director-friendly display.
 * e.g. "há 2h", "há 3d"
 */
export function formatTimeSince(hours: number): string {
    if (hours < 1) return 'há poucos minutos'
    if (hours < 24) return `há ${Math.round(hours)}h`
    const days = Math.floor(hours / 24)
    return `há ${days}d`
}
