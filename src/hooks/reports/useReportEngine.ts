import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/database.types'
import type { ReportIQR } from '@/lib/reports/reportTypes'

interface UseReportEngineOptions {
    config: ReportIQR | null
    dateStart?: string | null
    dateEnd?: string | null
    product?: string | null
    ownerId?: string | null
    enabled?: boolean
}

export function useReportEngine({
    config,
    dateStart,
    dateEnd,
    product,
    ownerId,
    enabled = true,
}: UseReportEngineOptions) {
    const hasMinConfig = config?.source &&
        (config.measures.length > 0 || (config.computedMeasures && config.computedMeasures.length > 0))

    return useQuery({
        queryKey: [
            'report-engine',
            config?.source,
            JSON.stringify(config?.dimensions),
            JSON.stringify(config?.measures),
            JSON.stringify(config?.computedMeasures),
            JSON.stringify(config?.breakdownBy),
            JSON.stringify(config?.filters),
            JSON.stringify(config?.orderBy),
            config?.limit,
            JSON.stringify(config?.comparison),
            dateStart,
            dateEnd,
            product,
            ownerId,
        ],
        queryFn: async () => {
            if (!config) throw new Error('No config provided')

            const { data, error } = await supabase.rpc('report_query_engine', {
                p_config: config as unknown as Json,
                p_date_start: dateStart ?? undefined,
                p_date_end: dateEnd ?? undefined,
                p_product: (product && product !== 'ALL') ? product : undefined,
                p_owner_id: ownerId ?? undefined,
            })

            if (error) throw error
            return (data ?? []) as Record<string, unknown>[]
        },
        enabled: enabled && !!hasMinConfig,
        retry: 1,
        staleTime: 1000 * 60 * 2,
    })
}
