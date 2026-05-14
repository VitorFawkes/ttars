import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface NPSMonthlyBucket {
    /** ISO month key — "2026-03" */
    monthKey: string
    /** Pretty label — "mar/26" */
    label: string
    npsScore: number | null
    total: number
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function buildLast12MonthsBuckets(): NPSMonthlyBucket[] {
    const now = startOfMonth(new Date())
    const buckets: NPSMonthlyBucket[] = []
    for (let i = 11; i >= 0; i--) {
        const d = addMonths(now, -i)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const monthKey = `${y}-${m}`
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
        buckets.push({ monthKey, label, npsScore: null, total: 0 })
    }
    return buckets
}

/**
 * Sempre retorna os últimos 12 meses, mesmo que algum mês não tenha respostas
 * (renderiza como gap na linha do gráfico). NPS Score mensal = (promotores -
 * detratores) / total * 100.
 */
export function useNPSMonthlyTrend() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery<NPSMonthlyBucket[]>({
        queryKey: ['nps-monthly-trend', activeOrgId],
        queryFn: async () => {
            const buckets = buildLast12MonthsBuckets()
            if (!activeOrgId) return buckets

            const startIso = new Date(
                Number(buckets[0].monthKey.slice(0, 4)),
                Number(buckets[0].monthKey.slice(5, 7)) - 1,
                1,
            ).toISOString()

            const { data, error } = await supabase
                .from('nps_responses' as never)
                .select('score, responded_at')
                .eq('org_id', activeOrgId)
                .gte('responded_at', startIso)

            if (error) throw error

            const grouped = new Map<string, number[]>()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const row of (data as any[]) ?? []) {
                const d = new Date(row.responded_at as string)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                if (!grouped.has(key)) grouped.set(key, [])
                grouped.get(key)!.push(row.score as number)
            }

            return buckets.map((b) => {
                const scores = grouped.get(b.monthKey) ?? []
                if (scores.length === 0) return b
                const promoters = scores.filter((s) => s >= 9).length
                const detractors = scores.filter((s) => s <= 6).length
                return {
                    ...b,
                    npsScore: Math.round(((promoters - detractors) / scores.length) * 100),
                    total: scores.length,
                }
            })
        },
        enabled: !!activeOrgId,
    })
}
