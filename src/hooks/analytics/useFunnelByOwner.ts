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
    valor_total: number
    receita_total: number
}

export type FunnelMetric = 'cards' | 'faturamento' | 'receita'

export interface FunnelStageChartData {
    stage: string
    fase: string
    [ownerName: string]: string | number
}

function getMetricValue(row: FunnelByOwnerRow, metric: FunnelMetric): number {
    if (metric === 'faturamento') return Number(row.valor_total) || 0
    if (metric === 'receita') return Number(row.receita_total) || 0
    return row.card_count
}

function pivotData(rows: FunnelByOwnerRow[], metric: FunnelMetric) {
    if (rows.length === 0) return { chartData: [] as FunnelStageChartData[], allOwners: [] as string[] }

    // 1. Sum total per owner across all stages using selected metric
    const ownerTotals = new Map<string, number>()
    let hasNaoAtribuido = false

    for (const row of rows) {
        const val = getMetricValue(row, metric)
        if (val <= 0) continue
        if (row.owner_name === NAO_ATRIBUIDO_LABEL) {
            hasNaoAtribuido = true
            continue
        }
        if (!row.owner_name) continue
        ownerTotals.set(row.owner_name, (ownerTotals.get(row.owner_name) || 0) + val)
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

        const val = getMetricValue(row, metric)
        if (val <= 0 || !row.owner_name) continue

        const stageObj = stageMap.get(key)!
        let bucket: string

        if (row.owner_name === NAO_ATRIBUIDO_LABEL) {
            bucket = NAO_ATRIBUIDO_LABEL
        } else if (topOwnerSet.has(row.owner_name)) {
            bucket = row.owner_name
        } else {
            bucket = OUTROS_LABEL
        }

        stageObj[bucket] = ((stageObj[bucket] as number) || 0) + val
    }

    // 5. Calculate totals per stage (sum of ALL visible owners)
    const chartData: FunnelStageChartData[] = stageOrder.map(key => {
        const stageObj = stageMap.get(key)!
        const total = owners.reduce((acc, owner) => acc + ((stageObj[owner] as number) || 0), 0)
        return { ...stageObj, total }
    })

    return { chartData, allOwners: owners }
}

export function useFunnelByOwner(metric: FunnelMetric = 'cards') {
    const { dateRange, product, mode, stageId, ownerIds, tagIds } = useAnalyticsFilters()

    const query = useQuery({
        queryKey: ['analytics', 'funnel-by-owner', dateRange.start, dateRange.end, product, mode, stageId, ownerIds, tagIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não existe nos types até deploy
            const { data, error } = await (supabase.rpc as any)('analytics_funnel_by_owner', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
            })
            if (error) throw error
            return (data as unknown as FunnelByOwnerRow[]) || []
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })

    const { chartData, allOwners } = useMemo(
        () => pivotData(query.data || [], metric),
        [query.data, metric],
    )

    return {
        data: query.data,
        chartData,
        allOwners,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    }
}
