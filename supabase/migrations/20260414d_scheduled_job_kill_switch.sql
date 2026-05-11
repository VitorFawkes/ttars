-- ============================================================================
-- Gap 2: Interruptor visível para processos agendados (pg_cron)
-- ============================================================================
-- Cria tabela-interruptor que todo cron confere antes de rodar. Admin consegue
-- pausar qualquer job pela UI sem precisar de SQL/DBA. Não depende de
-- cron.unschedule (que exige superuser).
-- ============================================================================

-- 1. Tabela de interruptores
CREATE TABLE IF NOT EXISTS scheduled_job_kill_switch (
  job_name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',  -- messaging, cadence, sync, routing, opportunity
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  frequency_label TEXT,  -- "a cada 1 min", "diário 9h UTC"
  last_toggled_at TIMESTAMPTZ,
  last_toggled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE scheduled_job_kill_switch IS
  'Gap 2 (2026-04-14): um switch por job agendado. Crons/edge functions conferem scheduled_job_is_enabled(name) antes de executar.';

-- 2. RLS: admin pode ler/editar, service role irrestrito
ALTER TABLE scheduled_job_kill_switch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kill_switch_admin_select" ON scheduled_job_kill_switch FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "kill_switch_admin_update" ON scheduled_job_kill_switch FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "kill_switch_service" ON scheduled_job_kill_switch FOR ALL TO service_role USING (true);

-- 3. Trigger de auditoria (quem/quando)
CREATE OR REPLACE FUNCTION scheduled_job_kill_switch_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_enabled IS DISTINCT FROM OLD.is_enabled THEN
    NEW.last_toggled_at := NOW();
    NEW.last_toggled_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_job_kill_switch_audit ON scheduled_job_kill_switch;
CREATE TRIGGER trg_scheduled_job_kill_switch_audit
  BEFORE UPDATE ON scheduled_job_kill_switch
  FOR EACH ROW
  EXECUTE FUNCTION scheduled_job_kill_switch_audit();

-- 4. Função helper — todo cron chama isso antes de fazer efeito
CREATE OR REPLACE FUNCTION scheduled_job_is_enabled(p_job_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM scheduled_job_kill_switch WHERE job_name = p_job_name),
    true  -- default: se não está registrado, assume habilitado (não bloqueia jobs novos)
  );
$$;

COMMENT ON FUNCTION scheduled_job_is_enabled(TEXT) IS
  'Retorna false se admin pausou o job agendado. Crons devem chamar antes de executar efeitos.';

-- 5. Seed — jobs já existentes no sistema que podem afetar clientes
INSERT INTO scheduled_job_kill_switch (job_name, label, description, category, frequency_label)
VALUES
  ('automacao-mensagem-processor',  'Processador de automações de mensagem',
   'Lê fila de automações e dispara mensagens WhatsApp conforme regras configuradas.',
   'messaging', 'a cada 1 min'),
  ('automacao-trigger-temporal',    'Automações temporais (aniversário, X dias parado)',
   'Dispara uma vez por dia as automações de tempo (ex: aniversário, X dias no estágio).',
   'messaging', 'diário 6h (SP)'),
  ('process-cadence-engine',        'Motor de cadências',
   'Executa passos pendentes de cadências em andamento (tarefas, envios, mudanças de etapa).',
   'cadence', 'a cada 2 min'),
  ('roteamento-pos-venda-trips',    'Roteamento pós-venda Trips',
   'Move cards Trips entre etapas do pós-venda conforme datas de viagem.',
   'routing', 'diário 6h (SP)'),
  ('monde-people-dispatch',         'Envio de contatos para Monde',
   'Empurra mudanças de contatos do CRM para o Monde (fila outbound).',
   'sync', 'a cada 2 min'),
  ('monde-people-import',           'Importação de contatos do Monde',
   'Busca contatos novos/atualizados no Monde e traz pro CRM.',
   'sync', 'a cada 2h'),
  ('process-future-opportunities',  'Oportunidades futuras (cards agendados)',
   'Cria cards ou sub-cards em datas programadas (pós-venda, retorno, etc).',
   'opportunity', 'diário 8h (SP)'),
  ('process-future-opportunities-retry', 'Oportunidades futuras — retry',
   'Retenta oportunidades futuras que falharam no run diário.',
   'opportunity', 'diário 11h (SP)')
ON CONFLICT (job_name) DO NOTHING;

-- 6. Reescrever os crons existentes para conferir o kill switch antes de disparar
-- (usamos cron.unschedule + cron.schedule pra substituir o body)

DO $$
BEGIN
  -- automacao-mensagem-processor (a cada 1 min)
  PERFORM cron.unschedule('automacao-mensagem-processor') FROM cron.job WHERE jobname = 'automacao-mensagem-processor';
  PERFORM cron.schedule(
    'automacao-mensagem-processor',
    '* * * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('automacao-mensagem-processor') THEN
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/automacao-mensagem-processor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- automacao-trigger-temporal (diário 9h UTC)
  PERFORM cron.unschedule('automacao-trigger-temporal') FROM cron.job WHERE jobname = 'automacao-trigger-temporal';
  PERFORM cron.schedule(
    'automacao-trigger-temporal',
    '0 9 * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('automacao-trigger-temporal') THEN
      net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/automacao-trigger-temporal',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- process-cadence-engine (a cada 2 min)
  PERFORM cron.unschedule('process-cadence-engine') FROM cron.job WHERE jobname = 'process-cadence-engine';
  PERFORM cron.schedule(
    'process-cadence-engine',
    '*/2 * * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('process-cadence-engine') THEN
      net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
        ),
        body := '{}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- roteamento-pos-venda-trips (diário 9h UTC) — função SQL pura
  PERFORM cron.unschedule('roteamento-pos-venda-trips') FROM cron.job WHERE jobname = 'roteamento-pos-venda-trips';
  PERFORM cron.schedule(
    'roteamento-pos-venda-trips',
    '0 9 * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('roteamento-pos-venda-trips')
      THEN fn_roteamento_pos_venda_trips()::TEXT
      ELSE 'paused' END;
    $cmd$
  );

  -- monde-people-dispatch (a cada 2 min)
  PERFORM cron.unschedule('monde-people-dispatch') FROM cron.job WHERE jobname = 'monde-people-dispatch';
  PERFORM cron.schedule(
    'monde-people-dispatch',
    '*/2 * * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('monde-people-dispatch') THEN
      net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-dispatch',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          'Content-Type', 'application/json'
        ),
        body := '{"batch_size": 20}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- monde-people-import (a cada 2h)
  PERFORM cron.unschedule('monde-people-import') FROM cron.job WHERE jobname = 'monde-people-import';
  PERFORM cron.schedule(
    'monde-people-import',
    '0 */2 * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('monde-people-import') THEN
      net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-import',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          'Content-Type', 'application/json'
        ),
        body := '{"page_limit": 100}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- process-future-opportunities (diário 11h UTC)
  PERFORM cron.unschedule('process-future-opportunities') FROM cron.job WHERE jobname = 'process-future-opportunities';
  PERFORM cron.schedule(
    'process-future-opportunities',
    '0 11 * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('process-future-opportunities') THEN
      net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/future-opportunity-processor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
        ),
        body := '{}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );

  -- process-future-opportunities-retry (diário 14h UTC)
  PERFORM cron.unschedule('process-future-opportunities-retry') FROM cron.job WHERE jobname = 'process-future-opportunities-retry';
  PERFORM cron.schedule(
    'process-future-opportunities-retry',
    '0 14 * * *',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('process-future-opportunities-retry') THEN
      net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/future-opportunity-processor',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
        ),
        body := '{"retry": true}'::jsonb
      )::TEXT
    ELSE 'paused' END;
    $cmd$
  );
END $$;

-- 7. RPC pra UI listar jobs + última execução (lê cron.job + cron.job_run_details)
CREATE OR REPLACE FUNCTION list_scheduled_jobs_with_status()
RETURNS TABLE(
  job_name TEXT,
  label TEXT,
  description TEXT,
  category TEXT,
  is_enabled BOOLEAN,
  frequency_label TEXT,
  last_toggled_at TIMESTAMPTZ,
  last_toggled_by UUID,
  cron_registered BOOLEAN,
  last_run_started_at TIMESTAMPTZ,
  last_run_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    s.job_name,
    s.label,
    s.description,
    s.category,
    s.is_enabled,
    s.frequency_label,
    s.last_toggled_at,
    s.last_toggled_by,
    EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = s.job_name) AS cron_registered,
    (
      SELECT r.start_time
      FROM cron.job j2
      JOIN cron.job_run_details r ON r.jobid = j2.jobid
      WHERE j2.jobname = s.job_name
      ORDER BY r.start_time DESC
      LIMIT 1
    ) AS last_run_started_at,
    (
      SELECT r.status
      FROM cron.job j3
      JOIN cron.job_run_details r ON r.jobid = j3.jobid
      WHERE j3.jobname = s.job_name
      ORDER BY r.start_time DESC
      LIMIT 1
    ) AS last_run_status
  FROM scheduled_job_kill_switch s
  ORDER BY s.category, s.label;
$$;

GRANT EXECUTE ON FUNCTION list_scheduled_jobs_with_status() TO authenticated;

-- 8. RPC "parar tudo" - desliga todos os jobs de uma vez (atômico)
CREATE OR REPLACE FUNCTION emergency_stop_all_scheduled_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Só admin pode chamar
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true) THEN
    RAISE EXCEPTION 'Apenas administradores podem parar todos os jobs';
  END IF;

  UPDATE scheduled_job_kill_switch
  SET is_enabled = false
  WHERE is_enabled = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION emergency_stop_all_scheduled_jobs() TO authenticated;
