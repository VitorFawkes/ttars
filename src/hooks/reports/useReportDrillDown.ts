import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/database.types'
import type { ReportIQR, DrillDownFilters } from '@/lib/reports/reportTypes'

interface UseDrillDownOptions {
    config: ReportIQR | null
    drillFilters: DrillDownFilters | null
    dateStart?: string | null
    dateEnd?: string | null
    product?: string | null
    ownerId?: string | null
}

export function useReportDrillDown({
    config,
    drillFilters,
    dateStart,
    dateEnd,
    product,
    ownerId,
}: UseDrillDownOptions) {
    const enabled = !!config && !!drillFilters && Object.keys(drillFilters).length > 0

    // Convert drill filters to array format expected by RPC
    const drillFiltersArray = drillFilters
        ? Object.entries(drillFilters).map(([field, value]) => ({ field, value }))
        : []

    return useQuery({
        queryKey: ['report-drill-down', JSON.stringify(config), JSON.stringify(drillFilters), dateStart, dateEnd, product, ownerId],
        queryFn: async () => {
            if (!config || !drillFilters) throw new Error('Missing config or filters')

            const { data, error } = await supabase.rpc('report_drill_down', {
                p_config: config as unknown as Json,
                p_drill_filters: drillFiltersArray as unknown as Json,
                p_date_start: dateStart ?? undefined,
                p_date_end: dateEnd ?? undefined,
                p_product: (product && product !== 'ALL') ? product : undefined,
                p_owner_id: ownerId ?? undefined,
            })

            if (error) throw error
            return (data ?? []) as Record<string, unknown>[]
        },
        enabled,
        retry: 1,
    })
}
