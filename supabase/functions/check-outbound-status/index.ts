import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        // 1. Check outbound settings
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('key, value')
            .in('key', ['OUTBOUND_SYNC_ENABLED', 'OUTBOUND_SHADOW_MODE', 'OUTBOUND_ALLOWED_EVENTS']);

        // 2. Check outbound queue status counts
        const { data: queueCounts } = await supabase
            .from('integration_outbound_queue')
            .select('status')
            .then(async (result) => {
                if (result.error) return { data: null };
                const counts: Record<string, number> = {};
                for (const row of result.data || []) {
                    counts[row.status] = (counts[row.status] || 0) + 1;
                }
                return { data: counts };
            });

        // 3. Get recent queue entries
        const { data: recentQueue } = await supabase
            .from('integration_outbound_queue')
            .select('id, card_id, event_type, status, payload, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        // 4. Check if outbound triggers table exists and has rules
        const { data: outboundRules, error: rulesError } = await supabase
            .from('integration_outbound_triggers')
            .select('id, name, action_mode, is_active')
            .order('priority', { ascending: true });

        // 5. Get queue by status
        const { count: pendingCount } = await supabase
            .from('integration_outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: shadowCount } = await supabase
            .from('integration_outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'shadow');

        const { count: sentCount } = await supabase
            .from('integration_outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sent');

        const { count: failedCount } = await supabase
            .from('integration_outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed');

        return new Response(JSON.stringify({
            settings: settings || [],
            queue_counts: {
                pending: pendingCount || 0,
                shadow: shadowCount || 0,
                sent: sentCount || 0,
                failed: failedCount || 0
            },
            recent_queue: recentQueue || [],
            outbound_rules: rulesError ? { error: rulesError.message } : (outboundRules || []),
            analysis: {
                outbound_enabled: settings?.find(s => s.key === 'OUTBOUND_SYNC_ENABLED')?.value === 'true',
                shadow_mode: settings?.find(s => s.key === 'OUTBOUND_SHADOW_MODE')?.value !== 'false',
                has_rules: !rulesError && (outboundRules?.length || 0) > 0,
                active_rules: outboundRules?.filter(r => r.is_active).length || 0
            }
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
