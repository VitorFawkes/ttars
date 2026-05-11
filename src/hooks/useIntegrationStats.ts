import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface IntegrationStats {
    inbound: {
        total: number;
        pending: number;
        processed: number;
        failed: number;
        ignored: number;
        blocked: number;
        today: number;
        thisWeek: number;
    };
    outbound: {
        total: number;
        pending: number;
        sent: number;
        failed: number;
        today: number;
    };
    rules: {
        inboundActive: number;
        inboundTotal: number;
        outboundActive: number;
        outboundTotal: number;
    };
    lastActivity: string | null;
}

interface UseIntegrationStatsOptions {
    integrationId?: string;
    refetchInterval?: number;
    enabled?: boolean;
}

/**
 * Hook centralizado para estatísticas de integração.
 * Consolida queries duplicadas de IntegrationOverviewTab, IntegrationStatusDashboard, etc.
 */
export function useIntegrationStats(options: UseIntegrationStatsOptions = {}) {
    const {
        integrationId,
        refetchInterval = 30000,
        enabled = true
    } = options;

    return useQuery({
        queryKey: ['integration-stats', integrationId],
        queryFn: async (): Promise<IntegrationStats> => {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

            // Build queries based on whether we have a specific integrationId
            const inboundQuery = supabase.from('integration_events').select('status');
            const inboundTodayQuery = supabase.from('integration_events').select('id').gte('created_at', todayStart);
            const inboundWeekQuery = supabase.from('integration_events').select('id').gte('created_at', weekStart);
            const outboundQuery = supabase.from('integration_outbound_queue').select('status');
            const outboundTodayQuery = supabase.from('integration_outbound_queue').select('id').gte('created_at', todayStart);
            const inboundRulesQuery = supabase.from('integration_inbound_triggers').select('id, is_active');
            const outboundRulesQuery = supabase.from('integration_outbound_triggers').select('id, is_active');
            const lastEventQuery = supabase
                .from('integration_events')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1);

            // Apply integrationId filter if provided
            if (integrationId) {
                inboundQuery.eq('integration_id', integrationId);
                inboundTodayQuery.eq('integration_id', integrationId);
                inboundWeekQuery.eq('integration_id', integrationId);
                inboundRulesQuery.eq('integration_id', integrationId);
                outboundRulesQuery.eq('integration_id', integrationId);
                lastEventQuery.eq('integration_id', integrationId);
            }

            const [
                inboundEventsRes,
                inboundTodayRes,
                inboundWeekRes,
                outboundQueueRes,
                outboundTodayRes,
                inboundRulesRes,
                outboundRulesRes,
                lastEventRes
            ] = await Promise.all([
                inboundQuery,
                inboundTodayQuery,
                inboundWeekQuery,
                outboundQuery,
                outboundTodayQuery,
                inboundRulesQuery,
                outboundRulesQuery,
                lastEventQuery
            ]);

            const inboundEvents = inboundEventsRes.data || [];
            const outboundQueue = outboundQueueRes.data || [];
            const inboundRules = inboundRulesRes.data || [];
            const outboundRules = outboundRulesRes.data || [];

            return {
                inbound: {
                    total: inboundEvents.length,
                    pending: inboundEvents.filter(e => e.status === 'pending').length,
                    processed: inboundEvents.filter(e =>
                        e.status === 'processed' || e.status === 'processed_shadow'
                    ).length,
                    failed: inboundEvents.filter(e => e.status === 'failed').length,
                    ignored: inboundEvents.filter(e => e.status === 'ignored').length,
                    blocked: inboundEvents.filter(e => e.status === 'blocked').length,
                    today: inboundTodayRes.data?.length || 0,
                    thisWeek: inboundWeekRes.data?.length || 0
                },
                outbound: {
                    total: outboundQueue.length,
                    pending: outboundQueue.filter(e => e.status === 'pending').length,
                    sent: outboundQueue.filter(e => e.status === 'sent').length,
                    failed: outboundQueue.filter(e => e.status === 'failed').length,
                    today: outboundTodayRes.data?.length || 0
                },
                rules: {
                    inboundActive: inboundRules.filter(r => r.is_active).length,
                    inboundTotal: inboundRules.length,
                    outboundActive: outboundRules.filter(r => r.is_active).length,
                    outboundTotal: outboundRules.length
                },
                lastActivity: lastEventRes.data?.[0]?.created_at || null
            };
        },
        refetchInterval,
        enabled
    });
}
