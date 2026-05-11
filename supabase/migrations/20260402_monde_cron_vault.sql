-- Cron jobs para sync Monde V2 usando vault para service_role_key (seguro)

-- 1. Outbound dispatch: processar fila a cada 2 minutos
SELECT cron.schedule(
  'monde-people-dispatch',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-dispatch'::text,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{"batch_size": 20}'::jsonb
  );
  $cron$
);

-- 2. Inbound import: importar do Monde a cada 2 horas
SELECT cron.schedule(
  'monde-people-import',
  '0 */2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-import'::text,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      'Content-Type', 'application/json'
    ),
    body := '{"page_limit": 100}'::jsonb
  );
  $cron$
);
