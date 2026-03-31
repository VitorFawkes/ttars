-- HIGH-4: Configura pg_cron para invocar integration-dispatch a cada 5 minutos
-- Requer: pg_cron e pg_net habilitados no Supabase

-- 1. Habilitar extensoes necessarias
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Inserir service_role_key no Vault (se ainda nao existir)
-- IMPORTANTE: Rode manualmente no SQL Editor do Supabase Dashboard:
--   SELECT vault.create_secret('service_role_key', '<SUA_SERVICE_ROLE_KEY>');
-- Ou via Dashboard > Project Settings > Vault

-- 3. Agendar dispatch a cada 5 minutos
SELECT cron.schedule(
  'dispatch-outbound-events',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/integration-dispatch',
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

-- Para verificar:
--   SELECT * FROM cron.job WHERE jobname = 'dispatch-outbound-events';
-- Para remover:
--   SELECT cron.unschedule('dispatch-outbound-events');
