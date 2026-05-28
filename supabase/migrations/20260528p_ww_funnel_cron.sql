-- ============================================================================
-- pg_cron: ww-ac-funnel-sync rodando a cada 30 minutos
--
-- Mantém ww_ac_deal_funnel_cache em paridade com a ActiveCampaign.
-- Bootstrap inicial foi feito via script Python local. Daqui pra frente o
-- cron roda mode=incremental que paginates só ranges novos/atualizados.
-- ============================================================================

-- Remove cron job antigo se existir (idempotente)
SELECT cron.unschedule('ww-ac-funnel-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ww-ac-funnel-sync');

-- Agendar a cada 30 minutos (00 e 30 de cada hora)
SELECT cron.schedule(
  'ww-ac-funnel-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ww-ac-funnel-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('mode', 'incremental')
  ) AS request_id;
  $$
);
