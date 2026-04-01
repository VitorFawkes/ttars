-- H3-014: Patch remaining 9 analytics RPCs that were missed by H3-010
-- These functions query cards but weren't in the original H3-010 list.

DO $patch$
DECLARE
    func_names TEXT[] := ARRAY[
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
        SELECT p.oid INTO func_oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = func_name
        LIMIT 1;

        IF func_oid IS NULL THEN
            RAISE NOTICE 'Function % not found, skipping', func_name;
            CONTINUE;
        END IF;

        func_def := pg_get_functiondef(func_oid);

        -- Idempotency guard
        IF position('requesting_org_id()' IN func_def) > 0 THEN
            RAISE NOTICE 'Function % already patched, skipping', func_name;
            CONTINUE;
        END IF;

        new_def := replace(func_def,
            'c.deleted_at IS NULL',
            'c.org_id = requesting_org_id() AND c.deleted_at IS NULL');

        new_def := replace(new_def,
            'sc.deleted_at IS NULL',
            'sc.org_id = requesting_org_id() AND sc.deleted_at IS NULL');

        new_def := replace(new_def,
            'pip.produto::TEXT = p_product',
            'pip.org_id = requesting_org_id() AND pip.produto::TEXT = p_product');
        new_def := replace(new_def,
            'pip.produto = p_product',
            'pip.org_id = requesting_org_id() AND pip.produto = p_product');
        new_def := replace(new_def,
            'p.produto::TEXT = p_product',
            'p.org_id = requesting_org_id() AND p.produto::TEXT = p_product');

        EXECUTE new_def;
        RAISE NOTICE 'Patched function: %', func_name;
    END LOOP;
END;
$patch$;
