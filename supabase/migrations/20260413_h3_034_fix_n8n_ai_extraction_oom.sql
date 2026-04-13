-- H3-034: fix OOM no cron 4 (n8n-ai-extraction-dispatch).
-- Root cause: pg_net background worker com memória esgotada + DO block inline
-- consumindo mais RAM que stored function. Fix: converter para stored function
-- SECURITY DEFINER + TRUNCATE tables net + pg_terminate_backend do worker.

TRUNCATE net.http_request_queue;

CREATE OR REPLACE FUNCTION public.dispatch_n8n_ai_extraction()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_service_key TEXT;
    v_pending BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_pending
    FROM n8n_ai_extraction_queue
    WHERE status = 'pending' AND scheduled_for <= now();
    IF v_pending = 0 THEN RETURN; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM integration_settings
        WHERE key = 'N8N_AI_WEBHOOK_ENABLED' AND value = 'true'
    ) THEN RETURN; END IF;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
    IF v_service_key IS NULL THEN RETURN; END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object('source', 'n8n-ai-extraction-dispatch')
    );
END;
$function$;

-- Reapontar cron para a stored function
SELECT cron.alter_job(
    job_id := 4,
    command := 'SELECT public.dispatch_n8n_ai_extraction()'
);
