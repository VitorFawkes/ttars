-- ============================================================================
-- Cron: ww-ac-journey-reconcile de hora em hora (rede de seguranca da jornada).
--
-- A jornada (ww_deal_event) se mantem em tempo real pelo webhook. Esta funcao e o
-- belt-and-suspenders: cada execucao re-puxa ~1/24 dos casais ativos nas esteiras
-- de fechamento (rotacao por hora dentro da propria funcao) -> cobre todos 1x/dia.
-- Roda em :05 pra nao colidir com o sync (:00/:30) nem o refresh (:10/:40).
-- ============================================================================

SELECT cron.unschedule('ww-ac-journey-reconcile')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ww-ac-journey-reconcile');

SELECT cron.schedule(
  'ww-ac-journey-reconcile',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ww-ac-journey-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
