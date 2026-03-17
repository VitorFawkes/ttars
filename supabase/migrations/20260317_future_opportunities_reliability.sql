-- ══════════════════════════════════════════════════════════════
-- Future Opportunities — Reliability: retry cron + failed status
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- 1. Permitir status 'failed' em future_opportunities
-- (sem constraint existente, o campo é TEXT livre, nada a alterar)

-- 2. Adicionar coluna metadata JSONB para logs de erro (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'future_opportunities' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE future_opportunities ADD COLUMN metadata JSONB DEFAULT NULL;
    END IF;
END
$$;

-- 3. Segundo cron de retry às 14h UTC (11h BRT) — 3h após principal
SELECT cron.schedule(
    'process-future-opportunities-retry',
    '0 14 * * *',
    $$
    SELECT net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/future-opportunity-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'service_role_key'
                LIMIT 1
            )
        ),
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

COMMIT;
