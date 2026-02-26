import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

const MAX_VISIBLE_OWNERS = 8
const OUTROS_LABEL = 'Outros'
const NAO_ATRIBUIDO_LABEL = 'Não atribuído'

interface FunnelByOwnerRow {
    stage_id: string
    stage_nome: string
    fase: string
    ordem: number
    owner_id: string | null
    owner_name: string
    card_count: number
}

export interface FunnelStageChartData {
    stage: string
    fase: string
    [ownerName: string]: string | number
}

export function useFunnelByOwner() {
    const { dateRange, product, mode, stageId, ownerId } = useAnalyticsFilters()

    const query = useQuery({
        queryKey: ['analytics', 'funnel-by-owner', dateRange.start, dateRange.end, product, mode, stageId, ownerId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não existe nos types até deploy
            const { data, error } = await (supabase.rpc as any)('analytics_funnel_by_owner', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_id: ownerId,
            })
            if (error) throw error
            return (data as unknown as FunnelByOwnerRow[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })

    const { chartData, allOwners } = useMemo(() => {
        const rows = query.data || []
        if (rows.length === 0) return { chartData: [], allOwners: [] }

        // 1. Sum total cards per owner across all stages
        const ownerTotals = new Map<string, number>()
        let hasNaoAtribuido = false

        for (const row of rows) {
            if (row.card_count <= 0) continue
            if (row.owner_name === NAO_ATRIBUIDO_LABEL) {
                hasNaoAtribuido = true
                continue
            }
            if (!row.owner_name) continue
            ownerTotals.set(row.owner_name, (ownerTotals.get(row.owner_name) || 0) + row.card_count)
        }

        // 2. Sort by volume descending, take top N
        const sortedOwners = Array.from(ownerTotals.entries())
            .sort((a, b) => b[1] - a[1])
        const topOwners = sortedOwners.slice(0, MAX_VISIBLE_OWNERS).map(([name]) => name)
        const topOwnerSet = new Set(topOwners)
        const hasOutros = sortedOwners.length > MAX_VISIBLE_OWNERS

        // 3. Build owner list for chart: top N + "Outros" + "Não atribuído"
        const owners: string[] = [...topOwners]
        if (hasOutros) owners.push(OUTROS_LABEL)
        if (hasNaoAtribuido) owners.push(NAO_ATRIBUIDO_LABEL)

        // 4. Pivot rows into chart data, grouping small owners into "Outros"
        const stageMap = new Map<string, FunnelStageChartData>()
        const stageOrder: string[] = []

        for (const row of rows) {
            const key = row.stage_id

            if (!stageMap.has(key)) {
                stageMap.set(key, { stage: row.stage_nome, fase: row.fase })
                stageOrder.push(key)
            }

            if (row.card_count <= 0 || !row.owner_name) continue

            const stageObj = stageMap.get(key)!
            let bucket: string

            if (row.owner_name === NAO_ATRIBUIDO_LABEL) {
                bucket = NAO_ATRIBUIDO_LABEL
            } else if (topOwnerSet.has(row.owner_name)) {
                bucket = row.owner_name
            } else {
                bucket = OUTROS_LABEL
            }

            stageObj[bucket] = ((stageObj[bucket] as number) || 0) + row.card_count
        }

        // 5. Calculate totals per stage (sum of ALL visible owners)
        const result: FunnelStageChartData[] = stageOrder.map(key => {
            const stageObj = stageMap.get(key)!
            const total = owners.reduce((acc, owner) => acc + ((stageObj[owner] as number) || 0), 0)
            return { ...stageObj, total }
        })

        return { chartData: result, allOwners: owners }
    }, [query.data])

    return {
        data: query.data,
        chartData,
        allOwners,
        isLoading: query.isLoading,
        error: query.error,
    }
}
