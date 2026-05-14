import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import type { NPSPeriod } from './useNPSKpis'

export type TrendGranularity = 'week' | 'month'

export interface NPSTrendBucket {
    /** YYYY-MM-DD (Monday of week) ou YYYY-MM (month) */
    key: string
    /** Pretty label — "13 abr" (semana) / "abr/26" (mês) */
    label: string
    npsScore: number | null
    total: number
}

export interface NPSTrendResult {
    buckets: NPSTrendBucket[]
    granularity: TrendGranularity
    subtitle: string
}

const DAY_MS = 86_400_000
const MAX_WEEKLY_SPAN_DAYS = 92

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Segunda-feira da semana de d (00:00 hora local). Semanas começam na seg. */
function startOfWeek(d: Date): Date {
    const day = d.getDay() // 0 = domingo, 1 = seg, ..., 6 = sáb
    const diff = day === 0 ? -6 : 1 - day
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
    return result
}

function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function dayKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function monthKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

function formatWeekLabel(monday: Date): string {
    const sunday = addDays(monday, 6)
    const monthMon = monday.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    const monthSun = sunday.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    const dayMon = String(monday.getDate()).padStart(2, '0')
    const daySun = String(sunday.getDate()).padStart(2, '0')
    if (monthMon === monthSun) {
        return `${dayMon}–${daySun} ${monthMon}`
    }
    return `${dayMon} ${monthMon}–${daySun} ${monthSun}`
}

function formatMonthLabel(d: Date): string {
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

function buildBucketsForRange(start: Date, end: Date): {
    buckets: NPSTrendBucket[]
    granularity: TrendGranularity
} {
    const span = (end.getTime() - start.getTime()) / DAY_MS
    if (span <= MAX_WEEKLY_SPAN_DAYS) {
        const buckets: NPSTrendBucket[] = []
        let cur = startOfWeek(startOfDay(start))
        const endDay = startOfDay(end)
        while (cur < endDay) {
            buckets.push({ key: dayKey(cur), label: formatWeekLabel(cur), npsScore: null, total: 0 })
            cur = addDays(cur, 7)
        }
        return { buckets, granularity: 'week' }
    }

    const buckets: NPSTrendBucket[] = []
    let cur = startOfMonth(start)
    const endMonth = startOfMonth(end)
    while (cur <= endMonth) {
        buckets.push({ key: monthKey(cur), label: formatMonthLabel(cur), npsScore: null, total: 0 })
        cur = addMonths(cur, 1)
    }
    return { buckets, granularity: 'month' }
}

function buildLast12MonthsBuckets(): { buckets: NPSTrendBucket[]; granularity: TrendGranularity } {
    const now = startOfMonth(new Date())
    const buckets: NPSTrendBucket[] = []
    for (let i = 11; i >= 0; i--) {
        const d = addMonths(now, -i)
        buckets.push({ key: monthKey(d), label: formatMonthLabel(d), npsScore: null, total: 0 })
    }
    return { buckets, granularity: 'month' }
}

function computeNps(scores: number[]): number {
    const promoters = scores.filter((s) => s >= 9).length
    const detractors = scores.filter((s) => s <= 6).length
    return Math.round(((promoters - detractors) / scores.length) * 100)
}

/**
 * Retorna a série temporal de NPS Score:
 *   • period.start/end NULL → últimos 12 meses (default, por mês)
 *   • span do período ≤ 92 dias → 1 bucket por dia
 *   • span > 92 dias → 1 bucket por mês (cobrindo o range completo)
 */
export function useNPSMonthlyTrend(period: NPSPeriod = { start: null, end: null }): {
    data: NPSTrendResult | undefined
    isLoading: boolean
} {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const startIso = period.start?.toISOString() ?? null
    const endIso = period.end?.toISOString() ?? null

    const query = useQuery<NPSTrendResult>({
        queryKey: ['nps-trend', activeOrgId, startIso, endIso],
        queryFn: async () => {
            const { buckets, granularity } =
                period.start && period.end
                    ? buildBucketsForRange(period.start, period.end)
                    : buildLast12MonthsBuckets()

            if (!activeOrgId || buckets.length === 0) {
                return { buckets, granularity, subtitle: subtitleFor(granularity, period, buckets) }
            }

            const rangeStart =
                period.start ??
                new Date(
                    Number(buckets[0].key.slice(0, 4)),
                    Number(buckets[0].key.slice(5, 7)) - 1,
                    1,
                )
            const rangeEnd = period.end ?? new Date()

            const { data, error } = await supabase
                .from('nps_responses' as never)
                .select('score, responded_at')
                .eq('org_id', activeOrgId)
                .gte('responded_at', rangeStart.toISOString())
                .lt('responded_at', rangeEnd.toISOString())

            if (error) throw error

            const grouped = new Map<string, number[]>()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const row of (data as any[]) ?? []) {
                const d = new Date(row.responded_at as string)
                const key = granularity === 'week' ? dayKey(startOfWeek(startOfDay(d))) : monthKey(d)
                if (!grouped.has(key)) grouped.set(key, [])
                grouped.get(key)!.push(row.score as number)
            }

            const enriched = buckets.map((b) => {
                const scores = grouped.get(b.key) ?? []
                if (scores.length === 0) return b
                return { ...b, npsScore: computeNps(scores), total: scores.length }
            })

            return { buckets: enriched, granularity, subtitle: subtitleFor(granularity, period, enriched) }
        },
        enabled: !!activeOrgId,
    })

    return { data: query.data, isLoading: query.isLoading }
}

function subtitleFor(granularity: TrendGranularity, period: NPSPeriod, buckets: NPSTrendBucket[]): string {
    if (!period.start || !period.end) return 'Últimos 12 meses'
    if (buckets.length === 0) return ''
    const first = buckets[0].label
    const last = buckets[buckets.length - 1].label
    const unit = granularity === 'week' ? 'Por semana' : 'Por mês'
    return `${unit} · ${first} → ${last}`
}
