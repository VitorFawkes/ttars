-- ============================================================================
-- Cadence: processamento instantâneo via pg_net
-- ============================================================================
-- Ao inserir na cadence_entry_queue ou cadence_queue, chama a cadence-engine
-- via pg_net imediatamente (async, ~1s). O cron continua como fallback.
--
-- Padrão: mesmo usado em push_trigger_lead_assigned, notify_teams_on_assign.
-- ============================================================================

-- 1. Trigger para cadence_entry_queue (novo card entra em etapa gatilho)
CREATE OR REPLACE FUNCTION notify_cadence_engine_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[cadence_instant] service_role_key not found in vault';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'action', 'process_entry_queue'
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[cadence_instant] pg_net entry call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_cadence_entry_instant ON public.cadence_entry_queue;

CREATE TRIGGER trg_cadence_entry_instant
    AFTER INSERT ON public.cadence_entry_queue
    FOR EACH ROW
    EXECUTE FUNCTION notify_cadence_engine_entry();


-- 2. Trigger para cadence_queue (novo step enfileirado para execução)
CREATE OR REPLACE FUNCTION notify_cadence_engine_queue()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[cadence_instant] service_role_key not found in vault';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[cadence_instant] pg_net queue call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_cadence_queue_instant ON public.cadence_queue;

CREATE TRIGGER trg_cadence_queue_instant
    AFTER INSERT ON public.cadence_queue
    FOR EACH ROW
    EXECUTE FUNCTION notify_cadence_engine_queue();
