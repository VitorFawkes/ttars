-- H3-031: fix crons jobid 20/21 (automacao-mensagem-processor, automacao-trigger-temporal).
-- Cron command usava `current_setting('app.settings.supabase_url')` e `.service_role_key`,
-- que não existem no escopo do background worker (fail consistente).
-- Reescreve como funções SQL que leem service_role_key do vault, URL hardcoded.

CREATE OR REPLACE FUNCTION public.dispatch_automacao_mensagem_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_service_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[automacao-mensagem] service_role_key not found in vault';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/automacao-mensagem-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_automacao_trigger_temporal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_service_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[automacao-trigger-temporal] service_role_key not found in vault';
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/automacao-trigger-temporal',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    );
END;
$function$;

-- Reapontar crons para as novas funções (lookup por jobname — mais robusto entre ambientes)
DO $$
DECLARE
    v_jobid INTEGER;
BEGIN
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'automacao-mensagem-processor';
    IF v_jobid IS NOT NULL THEN
        PERFORM cron.alter_job(
            job_id := v_jobid,
            command := 'SELECT public.dispatch_automacao_mensagem_processor()'
        );
    END IF;

    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'automacao-trigger-temporal';
    IF v_jobid IS NOT NULL THEN
        PERFORM cron.alter_job(
            job_id := v_jobid,
            command := 'SELECT public.dispatch_automacao_trigger_temporal()'
        );
    END IF;
END$$;
