import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const AC_INTEGRATION_ID = 'a2141b92-561f-4514-92b4-9412a068d236';

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

    const results: Record<string, unknown> = {};

    try {
        // 1. Clear pending queue
        console.log('[setup-outbound-rules] Clearing pending queue...');
        const { data: deletedQueue, error: deleteError } = await supabase
            .from('integration_outbound_queue')
            .delete()
            .eq('status', 'pending')
            .select('id');

        if (deleteError) {
            results.clear_queue = { error: deleteError.message };
        } else {
            results.clear_queue = { deleted: deletedQueue?.length || 0 };
        }
        console.log(`[setup-outbound-rules] Deleted ${deletedQueue?.length || 0} pending events`);

        // 2. Create default blocking rule
        console.log('[setup-outbound-rules] Creating default blocking rule...');

        // First check if rule already exists
        const { data: existingRule } = await supabase
            .from('integration_outbound_triggers')
            .select('id')
            .eq('integration_id', AC_INTEGRATION_ID)
            .eq('name', 'Bloqueio Padrão - Aguardando Configuração')
            .single();

        if (existingRule) {
            results.create_rule = { message: 'Rule already exists', id: existingRule.id };
        } else {
            const { data: newRule, error: ruleError } = await supabase
                .from('integration_outbound_triggers')
                .insert({
                    integration_id: AC_INTEGRATION_ID,
                    name: 'Bloqueio Padrão - Aguardando Configuração',
                    description: 'Bloqueia todos os eventos de outbound até que regras específicas sejam configuradas',
                    source_pipeline_ids: null,  // Qualquer pipeline
                    source_stage_ids: null,      // Qualquer estágio
                    source_owner_ids: null,      // Qualquer responsável
                    source_status: null,         // Qualquer status
                    event_types: ['stage_change', 'field_update', 'won', 'lost'],
                    sync_field_mode: 'all',
                    sync_fields: null,
                    action_mode: 'block',        // BLOQUEAR
                    is_active: true,
                    priority: 999                // Baixa prioridade (regras específicas têm prioridade)
                })
                .select()
                .single();

            if (ruleError) {
                results.create_rule = { error: ruleError.message };
            } else {
                results.create_rule = { created: true, id: newRule?.id };
            }
        }

        // NOTE: Trigger function (log_outbound_card_event) is managed via SQL migrations only.
        // Removed inline CREATE OR REPLACE to prevent migration drift.

        // 3. Verify setup
        const { data: rules } = await supabase
            .from('integration_outbound_triggers')
            .select('id, name, action_mode, is_active, priority')
            .eq('integration_id', AC_INTEGRATION_ID)
            .order('priority', { ascending: true });

        const { count: queueCount } = await supabase
            .from('integration_outbound_queue')
            .select('*', { count: 'exact', head: true });

        results.verification = {
            rules_count: rules?.length || 0,
            rules: rules,
            queue_count: queueCount || 0
        };

        return new Response(JSON.stringify({
            success: true,
            results
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[setup-outbound-rules] Error:', errorMessage);
        return new Response(JSON.stringify({
            success: false,
            error: errorMessage,
            results
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
