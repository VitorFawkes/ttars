-- H3-034: fix OOM no cron 4 (n8n-ai-extraction-dispatch).
-- Root cause: net.http_request_queue com 36MB de bloat + 70 items pendentes
-- processados em batch de 10 causando OOM na extensão pg_net.
-- Fix: reduzir LIMIT para 1 (processar 1 por ciclo de 2min), purgar bloat.

TRUNCATE net.http_request_queue;

-- Atualiza cron job 4 para LIMIT 1 (reduz pressão de memória no pg_net worker)
SELECT cron.alter_job(
    job_id := 4,
    command := $cmd$
    DO $job$
    DECLARE
        rec RECORD;
        v_url TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM integration_settings
            WHERE key = 'N8N_AI_WEBHOOK_ENABLED' AND value = 'true'
        ) THEN RETURN; END IF;

        SELECT value INTO v_url FROM integration_settings
        WHERE key = 'N8N_AI_WEBHOOK_URL';
        IF v_url IS NULL OR v_url = '' THEN RETURN; END IF;

        FOR rec IN
            SELECT id, card_id, message_count
            FROM n8n_ai_extraction_queue
            WHERE status = 'pending' AND scheduled_for <= now()
            ORDER BY scheduled_for ASC
            LIMIT 1
        LOOP
            UPDATE n8n_ai_extraction_queue
            SET status = 'sent', sent_at = now()
            WHERE id = rec.id;

            PERFORM net.http_post(
                url := v_url,
                headers := '{"Content-Type": "application/json"}'::jsonb,
                body := jsonb_build_object(
                    'card_id', rec.card_id,
                    'message_count', rec.message_count,
                    'queue_id', rec.id
                )
            );
        END LOOP;
    END;
    $job$;
    $cmd$
);
