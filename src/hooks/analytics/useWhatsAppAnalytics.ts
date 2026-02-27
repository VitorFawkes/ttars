import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──

export interface WaOverview {
    total_messages: number
    inbound: number
    outbound: number
    active_conversations: number
    unique_contacts: number
    unique_cards: number
    avg_msgs_per_conversation: number
    media_messages: number
    ai_messages: number
    human_messages: number
}

export interface WaDailyVolume {
    period: string
    inbound: number
    outbound: number
    ai: number
    human: number
}

export interface WaBucket {
    bucket: string
    count: number
}

export interface WaFirstResponse {
    avg_minutes: number
    median_minutes: number
    p90_minutes: number
    total_responses: number
    buckets: WaBucket[]
}

export interface WaAgentPerformance {
    user_name: string
    messages_sent: number
    conversations_handled: number
    avg_response_minutes: number
    median_response_minutes: number
}

export interface WaAging {
    total_unanswered: number
    buckets: WaBucket[]
}

export interface WaMessageType {
    type: string
    count: number
}

export interface WaAIStats {
    total_ai_msgs: number
    total_human_msgs: number
    ai_ratio: number
    ai_conversations: number
}

export interface WaHeatmapEntry {
    dow: number
    hour: number
    count: number
}

export interface WhatsAppMetricsV2 {
    overview: WaOverview
    daily_volume: WaDailyVolume[]
    hourly_heatmap: WaHeatmapEntry[]
    first_response: WaFirstResponse
    agent_performance: WaAgentPerformance[]
    aging: WaAging
    message_types: WaMessageType[]
    ai_stats: WaAIStats
}

// ── Hook ──

export function useWhatsAppAnalytics() {
    const { dateRange, product, granularity, ownerIds } = useAnalyticsFilters()

    return useQuery({
        queryKey: ['analytics', 'whatsapp-v2', dateRange.start, dateRange.end, product, granularity, ownerIds],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC retorna JSONB
            const { data, error } = await (supabase.rpc as any)('analytics_whatsapp_v2', {
                p_from: dateRange.start,
                p_to: dateRange.end,
                p_produto: product === 'ALL' ? null : product,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_granularity: granularity,
            })
            if (error) throw error
            return (data as unknown as WhatsAppMetricsV2) || null
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    })
}
