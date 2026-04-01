-- H3-010: Add org_id filtering to ALL analytics SECURITY DEFINER functions
-- Strategy: Create a helper that wraps the org_id check, then use ALTER for each
--
-- Since all analytics RPCs are SECURITY DEFINER and bypass RLS, they MUST explicitly
-- filter by org_id. We add c.org_id = requesting_org_id() to each function.
--
-- Due to the extreme length of these functions (2000+ lines total), we use the
-- approach of reading current definitions via pg_get_functiondef and patching them.

-- Helper: For each analytics function, we replace the pattern
-- "c.deleted_at IS NULL" with "c.org_id = requesting_org_id() AND c.deleted_at IS NULL"
-- This is safe because EVERY analytics function has this pattern in EVERY WHERE clause.

DO $patch$
DECLARE
    func_names TEXT[] := ARRAY[
        'analytics_funnel_live',
        'analytics_funnel_conversion',
        'analytics_overview_kpis',
        'analytics_sla_summary',
        'analytics_funnel_by_owner',
        'analytics_team_performance',
        'analytics_financial_breakdown',
        'analytics_sla_violations',
        'analytics_drill_down_cards',
        'analytics_operations_summary',
        'analytics_pipeline_current',
        'analytics_revenue_timeseries',
        'analytics_loss_reasons',
        'analytics_retention_cohort',
        'analytics_retention_kpis',
        'analytics_revenue_by_product',
        'analytics_top_destinations',
        'analytics_whatsapp_conversations',
        'analytics_whatsapp_metrics',
        'analytics_whatsapp_speed',
        'analytics_whatsapp_v2'
    ];
    func_name TEXT;
    func_oid OID;
    func_def TEXT;
    new_def TEXT;
BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
        -- Find the function OID (get the first match)
        SELECT p.oid INTO func_oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = func_name
        LIMIT 1;

        IF func_oid IS NULL THEN
            RAISE NOTICE 'Function % not found, skipping', func_name;
            CONTINUE;
        END IF;

        -- Get the full function definition
        func_def := pg_get_functiondef(func_oid);

        -- Idempotency guard: skip if already patched
        IF position('requesting_org_id()' IN func_def) > 0 THEN
            RAISE NOTICE 'Function % already patched, skipping', func_name;
            CONTINUE;
        END IF;

        -- Patch: Add org_id filter before every "c.deleted_at IS NULL"
        new_def := replace(func_def,
            'c.deleted_at IS NULL',
            'c.org_id = requesting_org_id() AND c.deleted_at IS NULL');

        -- Also patch: Add org filter for "sc.deleted_at IS NULL" (sub-cards alias)
        new_def := replace(new_def,
            'sc.deleted_at IS NULL',
            'sc.org_id = requesting_org_id() AND sc.deleted_at IS NULL');

        -- Also patch pipeline lookups: "pip.produto" patterns
        new_def := replace(new_def,
            'pip.produto::TEXT = p_product',
            'pip.org_id = requesting_org_id() AND pip.produto::TEXT = p_product');
        new_def := replace(new_def,
            'pip.produto = p_product',
            'pip.org_id = requesting_org_id() AND pip.produto = p_product');

        -- Also patch: "p.produto::TEXT = p_product" (alias 'p' for pipelines)
        new_def := replace(new_def,
            'p.produto::TEXT = p_product',
            'p.org_id = requesting_org_id() AND p.produto::TEXT = p_product');

        -- Execute the patched definition (which is a CREATE OR REPLACE FUNCTION)
        EXECUTE new_def;

        RAISE NOTICE 'Patched function: %', func_name;
    END LOOP;
END;
$patch$;
