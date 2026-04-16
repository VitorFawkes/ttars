-- ============================================================================
-- pg_cron: processar fila outbound a cada 30 segundos
-- ============================================================================

-- pg_cron minimo = 1 minuto. Para ~30s, agendamos 2 jobs defasados em 30s.
-- Job 1: roda no segundo 0 de cada minuto
SELECT cron.schedule(
  'ai-outbound-queue-a',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ai-agent-outbound-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Job 2: roda 30s depois via pg_sleep dentro do mesmo minuto
SELECT cron.schedule(
  'ai-outbound-queue-b',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ai-agent-outbound-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
