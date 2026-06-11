-- 20260611c — Conserta os crons de sincronização do Analytics Weddings (quebrados desde a criação)
--
-- DESCOBERTA (2026-06-11, investigando "Closer registrou e o painel não viu"):
-- os jobs 44 (ww-ac-funnel-sync, */30min) e 48 (ww-ac-journey-reconcile, hora em hora)
-- falham em TODA execução com:
--   ERROR: unrecognized configuration parameter "app.settings.supabase_url"
-- — usavam current_setting() de parâmetros que nunca existiram neste banco. Resultado:
-- campos preenchidos no Active SEM movimento de etapa (ex: "como foi feita a reunião")
-- nunca chegavam ao espelho (caso real: deal 29892, campo preenchido 61s após o último
-- sync por webhook; painel ficou 9 dias mostrando a reunião como não-feita).
--
-- O QUE FAZ:
-- 1) ww-ac-journey-reconcile (hora em hora): auth passa pro padrão que FUNCIONA nos
--    demais crons (URL fixa + service key do vault — igual ao job process-cadence-engine).
--    A função ganhou o PASSO 0 (reconciliação de campos: canal/motivos dos deals com
--    reunião agendada nos últimos 45d sem realização no espelho) — deploy junto.
-- 2) ww-ac-funnel-sync (*/30min): REMOVIDO da agenda. Nunca rodou com sucesso e, mesmo
--    com auth certa, não cabe no limite de tempo de uma execução (varre ~183k linhas
--    de campos; teste manual em 2026-06-11 morreu no IDLE_TIMEOUT de 150s sem completar).
--    A função continua deployada para uso MANUAL (bootstrap). A cobertura contínua fica:
--    webhook (tempo real, movimentos) + reconcile horário (campos + jornada).
--
-- Guards: roda só onde os jobs existem (staging não tem esses crons — vira no-op).

DO $$
DECLARE
  v_job_reconcile INT;
  v_job_fullsync  INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE 'pg_cron ausente — nada a fazer (staging?)';
    RETURN;
  END IF;

  SELECT jobid INTO v_job_reconcile FROM cron.job WHERE jobname = 'ww-ac-journey-reconcile' LIMIT 1;
  SELECT jobid INTO v_job_fullsync  FROM cron.job WHERE jobname = 'ww-ac-funnel-sync' LIMIT 1;

  IF v_job_reconcile IS NOT NULL THEN
    PERFORM cron.alter_job(v_job_reconcile, command := $cmd$
  SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/ww-ac-journey-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
$cmd$);
    RAISE NOTICE 'cron ww-ac-journey-reconcile (job %) corrigido para auth via vault', v_job_reconcile;
  ELSE
    RAISE NOTICE 'cron ww-ac-journey-reconcile não existe aqui — pulado';
  END IF;

  IF v_job_fullsync IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_fullsync);
    RAISE NOTICE 'cron ww-ac-funnel-sync (job %) removido da agenda (nunca rodou; não cabe no limite)', v_job_fullsync;
  ELSE
    RAISE NOTICE 'cron ww-ac-funnel-sync não existe aqui — pulado';
  END IF;
END $$;
