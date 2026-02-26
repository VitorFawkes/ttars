import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

export interface WhatsAppVolume {
    total_msgs: number
    inbound: number
    outbound: number
    active_conversations: number
}

export interface WhatsAppDaily {
    dia: string
    inbound: number
    outbound: number
}

export interface WhatsAppAging {
    lt_1h: number
    h1_4: number
    h4_24: number
    gt_24h: number
    total_unanswered: number
}

export interface WhatsAppResponseTime {
    avg_response_minutes: number
    median_response_minutes: number
}

export interface WhatsAppPerUser {
    user_nome: string
    avg_minutes: number
    total_replies: number
}

export interface WhatsAppMetrics {
    volume: WhatsAppVolume
    daily: WhatsAppDaily[]
    aging: WhatsAppAging
    response_time: WhatsAppResponseTime
    per_user: WhatsAppPerUser[]
}

export function useWhatsAppAnalytics() {
    const { dateRange, product, mode, stageId, ownerId } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'whatsapp-metrics', dateRange.start, dateRange.end, product, mode, stageId, ownerId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_whatsapp_metrics', {
                p_date_start: dateRange.start,
                p_date_end: dateRange.end,
                p_product: product === 'ALL' ? null : product,
                p_mode: mode,
                p_stage_id: stageId,
                p_owner_id: ownerId,
            })
            if (error) throw error
            return (data as unknown as WhatsAppMetrics) || null
        },
        retry: 1,
    })
}
