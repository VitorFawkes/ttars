import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──

export interface WaSlaCompliance {
    total_responses: number
    under_1min: number
    under_5min: number
    under_15min: number
    under_30min: number
    under_1hour: number
    pct_under_1min: number
    pct_under_5min: number
    pct_under_15min: number
    pct_under_30min: number
    pct_under_1hour: number
}

export interface WaFrtTrendPoint {
    period: string
    median_minutes: number
    avg_minutes: number
    count: number
}

export interface WaFrtByHour {
    hour: number
    median_minutes: number
    count: number
}

export interface WaFrtByTypeEntry {
    count: number
    avg_minutes: number
    median_minutes: number
    p90_minutes: number
}

export interface WaFrtByType {
    ai: WaFrtByTypeEntry
    human: WaFrtByTypeEntry
}

export interface WaSpeedBucket {
    bucket: string
    count: number
}

export interface WhatsAppSpeedMetrics {
    sla_compliance: WaSlaCompliance
    frt_trend: WaFrtTrendPoint[]
    frt_by_hour: WaFrtByHour[]
    frt_by_type: WaFrtByType
    frt_distribution: WaSpeedBucket[]
}

// ── Hook ──

export function useWhatsAppSpeed() {
    const { dateRange, product, granularity, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'whatsapp-speed', dateRange.start, dateRange.end, product, granularity, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_whatsapp_speed', {
                p_from: dateRange.start,
                p_to: dateRange.end,
                p_produto: product === 'ALL' ? null : product,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_granularity: granularity,
            })
            if (error) throw error
            return (data as unknown as WhatsAppSpeedMetrics) || null
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
