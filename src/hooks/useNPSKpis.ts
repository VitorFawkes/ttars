import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface NPSKpis {
    sent: number
    responded: number
    responseRate: number
    npsScore: number | null
    promoters: number
    passives: number
    detractors: number
}

function computeNps(scores: number[]): {
    npsScore: number
    promoters: number
    passives: number
    detractors: number
} {
    const promoters = scores.filter((s) => s >= 9).length
    const passives = scores.filter((s) => s >= 7 && s <= 8).length
    const detractors = scores.filter((s) => s <= 6).length
    const total = scores.length
    const npsScore = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100)
    return { npsScore, promoters, passives, detractors }
}

export function useNPSKpis() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery<NPSKpis>({
        queryKey: ['nps-kpis', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) {
                return { sent: 0, responded: 0, responseRate: 0, npsScore: null, promoters: 0, passives: 0, detractors: 0 }
            }

            const [sentResult, responsesResult] = await Promise.all([
                supabase
                    .from('nps_surveys' as never)
                    .select('id', { count: 'exact', head: true })
                    .eq('org_id', activeOrgId),
                supabase
                    .from('nps_responses' as never)
                    .select('score')
                    .eq('org_id', activeOrgId),
            ])

            if (sentResult.error) throw sentResult.error
            if (responsesResult.error) throw responsesResult.error

            const sent = sentResult.count ?? 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scores = ((responsesResult.data as any[]) ?? []).map((r) => r.score as number)
            const responded = scores.length
            const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0

            if (responded === 0) {
                return { sent, responded, responseRate, npsScore: null, promoters: 0, passives: 0, detractors: 0 }
            }

            const segment = computeNps(scores)
            return { sent, responded, responseRate, ...segment }
        },
        enabled: !!activeOrgId,
    })
}
