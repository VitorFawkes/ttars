-- Migration: Sync bidirecional automático Contatos ↔ Monde V2 People
-- Cria: tabela de fila, triggers outbound, campo monde_last_sync, cron jobs

-- 1. Campo monde_last_sync em contatos
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS monde_last_sync TIMESTAMPTZ;

-- 2. Tabela de fila outbound
CREATE TABLE IF NOT EXISTS public.monde_people_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated')),
  changed_fields TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_monde_queue_pending
  ON public.monde_people_queue(status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_monde_queue_contato
  ON public.monde_people_queue(contato_id, created_at DESC);

-- RLS: service role pode tudo, trigger function usa SECURITY DEFINER
ALTER TABLE public.monde_people_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on monde_people_queue"
  ON public.monde_people_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Trigger function
CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_sync_source TEXT;
  v_changed TEXT[];
BEGIN
  -- Anti-loop: skip se a origem é o import do Monde
  v_sync_source := current_setting('app.monde_sync_source', true);
  IF v_sync_source = 'import' THEN
    RETURN NEW;
  END IF;

  -- Skip se sync não está habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_ENABLED' AND value = 'true'
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip se direção é inbound_only
  IF EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_DIRECTION' AND value = 'inbound_only'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Skip contatos sem nome (incomplete records)
    IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
    VALUES (NEW.id, 'created', NULL);

  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar campos relevantes que mudaram
    v_changed := ARRAY[]::TEXT[];

    IF OLD.nome IS DISTINCT FROM NEW.nome THEN v_changed := v_changed || 'nome'; END IF;
    IF OLD.sobrenome IS DISTINCT FROM NEW.sobrenome THEN v_changed := v_changed || 'sobrenome'; END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed := v_changed || 'email'; END IF;
    IF OLD.telefone IS DISTINCT FROM NEW.telefone THEN v_changed := v_changed || 'telefone'; END IF;
    IF OLD.cpf IS DISTINCT FROM NEW.cpf THEN v_changed := v_changed || 'cpf'; END IF;
    IF OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento THEN v_changed := v_changed || 'data_nascimento'; END IF;
    IF OLD.sexo IS DISTINCT FROM NEW.sexo THEN v_changed := v_changed || 'sexo'; END IF;
    IF OLD.passaporte IS DISTINCT FROM NEW.passaporte THEN v_changed := v_changed || 'passaporte'; END IF;
    IF OLD.passaporte_validade IS DISTINCT FROM NEW.passaporte_validade THEN v_changed := v_changed || 'passaporte_validade'; END IF;
    IF OLD.rg IS DISTINCT FROM NEW.rg THEN v_changed := v_changed || 'rg'; END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN v_changed := v_changed || 'observacoes'; END IF;
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN v_changed := v_changed || 'endereco'; END IF;
    IF OLD.tipo_cliente IS DISTINCT FROM NEW.tipo_cliente THEN v_changed := v_changed || 'tipo_cliente'; END IF;

    -- Só enfileira se algo relevante mudou
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, 'updated', v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Triggers no contatos
DROP TRIGGER IF EXISTS trg_monde_people_outbound_insert ON public.contatos;
CREATE TRIGGER trg_monde_people_outbound_insert
  AFTER INSERT ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.log_monde_people_event();

DROP TRIGGER IF EXISTS trg_monde_people_outbound_update ON public.contatos;
CREATE TRIGGER trg_monde_people_outbound_update
  AFTER UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.log_monde_people_event();

-- 5. RPC para anti-loop (usado pelo monde-people-import)
CREATE OR REPLACE FUNCTION public.set_monde_import_flag()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.monde_sync_source', 'import', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Cron jobs (pg_cron + pg_net)

-- Outbound dispatch: a cada 2 minutos
SELECT cron.schedule(
  'monde-people-dispatch',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-dispatch',
    headers := '{"Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- Inbound import: a cada 30 minutos
SELECT cron.schedule(
  'monde-people-import',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-import',
    headers := '{"Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
    body := '{"page_limit": 100}'::jsonb
  )$$
);

-- Cleanup: limpar fila processada (diário às 3am)
SELECT cron.schedule(
  'monde-queue-cleanup',
  '0 3 * * *',
  $$DELETE FROM public.monde_people_queue WHERE status = 'done' AND processed_at < now() - interval '7 days'$$
);
