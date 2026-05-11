import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!databaseUrl) {
        return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL not set' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const sql = postgres(databaseUrl, { ssl: 'require' });

    try {
        console.log('[apply-outbound-rules-migration] Starting migration...');

        // 1. Create table
        await sql`
            CREATE TABLE IF NOT EXISTS public.integration_outbound_triggers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT,
                source_pipeline_ids UUID[],
                source_stage_ids UUID[],
                source_owner_ids UUID[],
                source_status TEXT[],
                event_types TEXT[] DEFAULT '{stage_change,field_update,won,lost}',
                sync_field_mode TEXT DEFAULT 'all' CHECK (sync_field_mode IN ('all', 'selected', 'exclude')),
                sync_fields TEXT[],
                action_mode TEXT DEFAULT 'allow' CHECK (action_mode IN ('allow', 'block')),
                is_active BOOLEAN DEFAULT true,
                priority INTEGER DEFAULT 100,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;
        console.log('[apply-outbound-rules-migration] Table created');

        // 2. Create indexes
        await sql`CREATE INDEX IF NOT EXISTS idx_outbound_triggers_integration_id ON public.integration_outbound_triggers(integration_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_outbound_triggers_active ON public.integration_outbound_triggers(is_active) WHERE is_active = true`;
        await sql`CREATE INDEX IF NOT EXISTS idx_outbound_triggers_priority ON public.integration_outbound_triggers(priority)`;
        console.log('[apply-outbound-rules-migration] Indexes created');

        // 3. Create updated_at trigger function
        await sql`
            CREATE OR REPLACE FUNCTION update_outbound_triggers_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;
        console.log('[apply-outbound-rules-migration] Updated_at function created');

        // 4. Create trigger
        await sql`DROP TRIGGER IF EXISTS tr_outbound_triggers_updated_at ON public.integration_outbound_triggers`;
        await sql`
            CREATE TRIGGER tr_outbound_triggers_updated_at
            BEFORE UPDATE ON public.integration_outbound_triggers
            FOR EACH ROW
            EXECUTE FUNCTION update_outbound_triggers_updated_at()
        `;
        console.log('[apply-outbound-rules-migration] Updated_at trigger created');

        // 5. Create check_outbound_trigger function
        await sql`
            CREATE OR REPLACE FUNCTION check_outbound_trigger(
                p_integration_id UUID,
                p_pipeline_id UUID,
                p_stage_id UUID,
                p_owner_id UUID,
                p_status TEXT,
                p_event_type TEXT,
                p_field_name TEXT DEFAULT NULL
            )
            RETURNS TABLE (
                allowed BOOLEAN,
                rule_id UUID,
                rule_name TEXT,
                action_mode TEXT,
                sync_field_mode TEXT,
                sync_fields TEXT[],
                reason TEXT
            ) AS $$
            DECLARE
                v_trigger RECORD;
                v_has_rules BOOLEAN := FALSE;
            BEGIN
                SELECT EXISTS (
                    SELECT 1 FROM public.integration_outbound_triggers
                    WHERE integration_id = p_integration_id AND is_active = true
                ) INTO v_has_rules;

                IF NOT v_has_rules THEN
                    RETURN QUERY SELECT
                        true::BOOLEAN,
                        NULL::UUID,
                        NULL::TEXT,
                        'allow'::TEXT,
                        'all'::TEXT,
                        NULL::TEXT[],
                        'No outbound rules configured - allowing all'::TEXT;
                    RETURN;
                END IF;

                FOR v_trigger IN
                    SELECT t.* FROM public.integration_outbound_triggers t
                    WHERE t.integration_id = p_integration_id
                      AND t.is_active = true
                    ORDER BY t.priority ASC, t.created_at ASC
                LOOP
                    IF v_trigger.source_pipeline_ids IS NOT NULL AND
                       NOT (p_pipeline_id = ANY(v_trigger.source_pipeline_ids)) THEN
                        CONTINUE;
                    END IF;

                    IF v_trigger.source_stage_ids IS NOT NULL AND
                       NOT (p_stage_id = ANY(v_trigger.source_stage_ids)) THEN
                        CONTINUE;
                    END IF;

                    IF v_trigger.source_owner_ids IS NOT NULL AND
                       NOT (p_owner_id = ANY(v_trigger.source_owner_ids)) THEN
                        CONTINUE;
                    END IF;

                    IF v_trigger.source_status IS NOT NULL AND
                       NOT (p_status = ANY(v_trigger.source_status)) THEN
                        CONTINUE;
                    END IF;

                    IF v_trigger.event_types IS NOT NULL AND
                       NOT (p_event_type = ANY(v_trigger.event_types)) THEN
                        CONTINUE;
                    END IF;

                    IF p_event_type = 'field_update' AND p_field_name IS NOT NULL THEN
                        IF v_trigger.sync_field_mode = 'selected' AND v_trigger.sync_fields IS NOT NULL THEN
                            IF NOT (p_field_name = ANY(v_trigger.sync_fields)) THEN
                                RETURN QUERY SELECT
                                    false::BOOLEAN,
                                    v_trigger.id,
                                    v_trigger.name,
                                    v_trigger.action_mode,
                                    v_trigger.sync_field_mode,
                                    v_trigger.sync_fields,
                                    format('Field not in allowed list for rule %s', v_trigger.name)::TEXT;
                                RETURN;
                            END IF;
                        ELSIF v_trigger.sync_field_mode = 'exclude' AND v_trigger.sync_fields IS NOT NULL THEN
                            IF p_field_name = ANY(v_trigger.sync_fields) THEN
                                RETURN QUERY SELECT
                                    false::BOOLEAN,
                                    v_trigger.id,
                                    v_trigger.name,
                                    v_trigger.action_mode,
                                    v_trigger.sync_field_mode,
                                    v_trigger.sync_fields,
                                    format('Field is excluded by rule %s', v_trigger.name)::TEXT;
                                RETURN;
                            END IF;
                        END IF;
                    END IF;

                    IF v_trigger.action_mode = 'block' THEN
                        RETURN QUERY SELECT
                            false::BOOLEAN,
                            v_trigger.id,
                            v_trigger.name,
                            v_trigger.action_mode,
                            v_trigger.sync_field_mode,
                            v_trigger.sync_fields,
                            format('Blocked by rule %s', v_trigger.name)::TEXT;
                        RETURN;
                    ELSE
                        RETURN QUERY SELECT
                            true::BOOLEAN,
                            v_trigger.id,
                            v_trigger.name,
                            v_trigger.action_mode,
                            v_trigger.sync_field_mode,
                            v_trigger.sync_fields,
                            format('Allowed by rule %s', v_trigger.name)::TEXT;
                        RETURN;
                    END IF;
                END LOOP;

                RETURN QUERY SELECT
                    false::BOOLEAN,
                    NULL::UUID,
                    NULL::TEXT,
                    'block'::TEXT,
                    NULL::TEXT,
                    NULL::TEXT[],
                    'No matching outbound rule found - blocking by default'::TEXT;
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER
        `;
        console.log('[apply-outbound-rules-migration] check_outbound_trigger function created');

        // 6. Enable RLS
        await sql`ALTER TABLE public.integration_outbound_triggers ENABLE ROW LEVEL SECURITY`;
        console.log('[apply-outbound-rules-migration] RLS enabled');

        // 7. Create RLS policies (drop first if exist)
        await sql`DROP POLICY IF EXISTS "Admins can manage outbound triggers" ON public.integration_outbound_triggers`;
        await sql`DROP POLICY IF EXISTS "Authenticated users can view outbound triggers" ON public.integration_outbound_triggers`;

        await sql`
            CREATE POLICY "Admins can manage outbound triggers"
            ON public.integration_outbound_triggers
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            )
        `;

        await sql`
            CREATE POLICY "Authenticated users can view outbound triggers"
            ON public.integration_outbound_triggers
            FOR SELECT
            USING (auth.role() = 'authenticated')
        `;
        console.log('[apply-outbound-rules-migration] RLS policies created');

        await sql.end();

        return new Response(JSON.stringify({
            success: true,
            message: 'Outbound trigger rules migration applied successfully'
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: unknown) {
        await sql.end();
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[apply-outbound-rules-migration] Error:', errorMessage);
        return new Response(JSON.stringify({
            success: false,
            error: errorMessage
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
