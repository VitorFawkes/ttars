-- ============================================================
-- MIGRATION: Fix WhatsApp Functions Search Path
-- Date: 2026-01-29
-- Description: Corrige search_path das funções WhatsApp para usar public
-- ============================================================

-- Corrigir search_path das funções WhatsApp
ALTER FUNCTION public.process_whatsapp_raw_event_v2(uuid) SET search_path = public;
ALTER FUNCTION public.process_all_pending_whatsapp_events() SET search_path = public;
ALTER FUNCTION public.process_pending_whatsapp_events(integer) SET search_path = public;
ALTER FUNCTION public.trigger_auto_process_whatsapp_event() SET search_path = public;
ALTER FUNCTION public.find_contact_by_whatsapp(text) SET search_path = public;

-- ============================================================
-- FUNÇÃO: Reprocessar eventos pending em batch
-- ============================================================

CREATE OR REPLACE FUNCTION reprocess_pending_whatsapp_events(batch_size integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_result jsonb;
    v_processed integer := 0;
    v_errors integer := 0;
    v_results jsonb[] := ARRAY[]::jsonb[];
BEGIN
    FOR v_event IN
        SELECT id
        FROM whatsapp_raw_events
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT batch_size
    LOOP
        BEGIN
            v_result := process_whatsapp_raw_event_v2(v_event.id);
            v_processed := v_processed + 1;
            v_results := v_results || jsonb_build_object('id', v_event.id, 'result', v_result);
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
            UPDATE whatsapp_raw_events
            SET status = 'error', error_message = SQLERRM, processed_at = NOW()
            WHERE id = v_event.id;
            v_results := v_results || jsonb_build_object('id', v_event.id, 'error', SQLERRM);
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'processed', v_processed,
        'errors', v_errors,
        'details', to_jsonb(v_results)
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reprocess_pending_whatsapp_events(integer) TO service_role;

COMMENT ON FUNCTION reprocess_pending_whatsapp_events IS 'Reprocessa eventos WhatsApp com status pending em batch';
