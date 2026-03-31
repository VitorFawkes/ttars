-- FIX: Safety net para eventos inbound stuck em pending
-- Reprocessa eventos pendentes a cada 5 minutos (mesmo padrao do dispatch-outbound-events)
-- Resolve: auto-process fire-and-forget do webhook-ingest que pode falhar silenciosamente

SELECT cron.schedule(
  'reprocess-inbound-events',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/integration-process',
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
--   SELECT * FROM cron.job WHERE jobname = 'reprocess-inbound-events';
-- Para remover:
--   SELECT cron.unschedule('reprocess-inbound-events');
