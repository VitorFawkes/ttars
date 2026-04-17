-- ============================================================================
-- FIXUP: Garantir que ai_outbound_queue + RPCs + dedup + cleanup existem
-- ============================================================================
-- Corrige aplicacao parcial das migrations 20260416/20260416d em producao

-- ============================================================================
-- 1. Tabela ai_outbound_queue (IF NOT EXISTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_outbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  card_id UUID NOT NULL,
  contato_id UUID NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  form_data JSONB DEFAULT '{}'::JSONB,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('card_created', 'stage_changed', 'idle_days', 'manual')),
  trigger_metadata JSONB DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'processing', 'sent', 'failed', 'skipped', 'expired'
  )),
  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- FKs condicionais
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbound_queue_card') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cards' AND table_schema = 'public') THEN
      ALTER TABLE ai_outbound_queue ADD CONSTRAINT fk_outbound_queue_card
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_outbound_queue_contato') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contatos' AND table_schema = 'public') THEN
      ALTER TABLE ai_outbound_queue ADD CONSTRAINT fk_outbound_queue_contato
        FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE;
    END IF;
  END IF;
END;
$$;

-- Indices (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending ON ai_outbound_queue(org_id, status, scheduled_for) WHERE status IN ('pending', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_outbound_queue_agent ON ai_outbound_queue(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_card ON ai_outbound_queue(card_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_cleanup ON ai_outbound_queue(status, updated_at) WHERE status IN ('failed', 'sent', 'skipped', 'expired');

-- RLS
ALTER TABLE ai_outbound_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_outbound_queue' AND policyname = 'outbound_queue_org_all') THEN
    CREATE POLICY "outbound_queue_org_all" ON ai_outbound_queue TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_outbound_queue' AND policyname = 'outbound_queue_service_all') THEN
    CREATE POLICY "outbound_queue_service_all" ON ai_outbound_queue TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ============================================================================
-- 2. Trigger enqueue on card created
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_enqueue_outbound_on_card_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_contato RECORD;
  v_phone TEXT;
  v_form_data JSONB;
  v_trigger_config JSONB;
  v_conditions JSONB;
  v_origens_permitidas JSONB;
  v_delay_seconds INT;
  v_scheduled TIMESTAMPTZ;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.contato_principal_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, telefone, nome, sobrenome INTO v_contato
    FROM contatos WHERE id = NEW.contato_principal_id;

  IF v_contato IS NULL OR v_contato.telefone IS NULL OR v_contato.telefone = '' THEN
    RETURN NEW;
  END IF;

  v_phone := v_contato.telefone;
  v_form_data := COALESCE(NEW.produto_data, '{}'::JSONB);

  FOR v_agent IN
    SELECT id, outbound_trigger_config, first_message_config
      FROM ai_agents
     WHERE org_id = NEW.org_id
       AND produto::TEXT = NEW.produto::TEXT
       AND ativa = true
       AND interaction_mode IN ('outbound', 'hybrid')
       AND outbound_trigger_config IS NOT NULL
  LOOP
    v_trigger_config := v_agent.outbound_trigger_config;

    FOR v_conditions IN
      SELECT jsonb_array_elements(v_trigger_config->'triggers')
    LOOP
      IF v_conditions->>'type' = 'card_created' THEN
        v_origens_permitidas := v_conditions->'conditions'->'origem';
        IF v_origens_permitidas IS NOT NULL AND jsonb_typeof(v_origens_permitidas) = 'array' THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_origens_permitidas) AS o
            WHERE o = COALESCE(NEW.origem, 'manual')
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        v_delay_seconds := COALESCE((v_agent.first_message_config->>'delay_seconds')::INT, 30);
        v_scheduled := now() + (v_delay_seconds || ' seconds')::INTERVAL;

        INSERT INTO ai_outbound_queue (
          org_id, agent_id, card_id, contato_id,
          contact_phone, contact_name, form_data,
          trigger_type, trigger_metadata, status, scheduled_for
        ) VALUES (
          NEW.org_id, v_agent.id, NEW.id, v_contato.id,
          v_phone,
          COALESCE(v_contato.nome, '') || COALESCE(' ' || v_contato.sobrenome, ''),
          v_form_data,
          'card_created',
          jsonb_build_object('card_titulo', NEW.titulo, 'card_origem', NEW.origem, 'card_produto', NEW.produto),
          'scheduled', v_scheduled
        );
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cards' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_card_outbound_queue ON cards;
    CREATE TRIGGER trg_card_outbound_queue
      AFTER INSERT ON cards FOR EACH ROW
      EXECUTE FUNCTION fn_enqueue_outbound_on_card_created();
  END IF;
END;
$$;

-- ============================================================================
-- 3. RPCs para processar fila outbound
-- ============================================================================
CREATE OR REPLACE FUNCTION process_outbound_queue(p_limit INT DEFAULT 10)
RETURNS TABLE (
  queue_id UUID, agent_id UUID, card_id UUID, contato_id UUID,
  contact_phone TEXT, contact_name TEXT, form_data JSONB,
  trigger_type TEXT, trigger_metadata JSONB, org_id UUID,
  first_message_config JSONB, interaction_mode TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT q.id FROM ai_outbound_queue q
     WHERE q.status IN ('pending', 'scheduled')
       AND (q.scheduled_for IS NULL OR q.scheduled_for <= now())
       AND q.attempts < q.max_attempts
     ORDER BY q.scheduled_for ASC NULLS FIRST, q.created_at ASC
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE ai_outbound_queue SET status = 'processing', attempts = attempts + 1, updated_at = now()
     WHERE id IN (SELECT r.id FROM ready r) RETURNING ai_outbound_queue.*
  )
  SELECT c.id, c.agent_id, c.card_id, c.contato_id, c.contact_phone, c.contact_name,
         c.form_data, c.trigger_type, c.trigger_metadata, c.org_id,
         a.first_message_config, a.interaction_mode
    FROM claimed c JOIN ai_agents a ON a.id = c.agent_id AND a.ativa = true;
END;
$$;

CREATE OR REPLACE FUNCTION complete_outbound_queue_item(
  p_queue_id UUID, p_status TEXT, p_error TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE ai_outbound_queue
     SET status = p_status,
         processed_at = CASE WHEN p_status IN ('sent', 'skipped') THEN now() ELSE processed_at END,
         error_message = p_error,
         next_retry_at = CASE WHEN p_status = 'failed' AND attempts < max_attempts
           THEN now() + (power(2, attempts) * INTERVAL '1 minute') ELSE NULL END,
         updated_at = now()
   WHERE id = p_queue_id;
END;
$$;

-- ============================================================================
-- 4. RPC get_outbound_queue_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION get_outbound_queue_stats(
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_pending BIGINT,
  total_sent_today BIGINT,
  total_failed_today BIGINT,
  total_skipped BIGINT,
  success_rate_7d NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := requesting_org_id();
  v_today_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_7d_ago TIMESTAMPTZ := now() - INTERVAL '7 days';
  v_sent_7d BIGINT;
  v_total_7d BIGINT;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN q.status IN ('pending', 'scheduled', 'processing') THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN q.status = 'sent' AND q.processed_at >= v_today_start THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN q.status = 'failed' AND q.updated_at >= v_today_start THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN q.status = 'skipped' THEN 1 ELSE 0 END), 0)
  INTO total_pending, total_sent_today, total_failed_today, total_skipped
  FROM ai_outbound_queue q
  WHERE q.org_id = v_org_id
    AND (p_agent_id IS NULL OR q.agent_id = p_agent_id);

  SELECT
    COALESCE(SUM(CASE WHEN q.status = 'sent' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN q.status IN ('sent', 'failed', 'skipped') THEN 1 ELSE 0 END), 0)
  INTO v_sent_7d, v_total_7d
  FROM ai_outbound_queue q
  WHERE q.org_id = v_org_id
    AND (p_agent_id IS NULL OR q.agent_id = p_agent_id)
    AND q.created_at >= v_7d_ago;

  success_rate_7d := CASE
    WHEN v_total_7d > 0 THEN ROUND((v_sent_7d::NUMERIC / v_total_7d) * 100, 1)
    ELSE 0
  END;

  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 5. Dedup trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_outbound_queue_dedup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_outbound_queue
    WHERE contato_id = NEW.contato_id
      AND agent_id = NEW.agent_id
      AND status IN ('pending', 'scheduled', 'processing')
  ) THEN
    RAISE NOTICE 'outbound_queue_dedup: item duplicado ignorado (contato=%, agent=%)', NEW.contato_id, NEW.agent_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbound_queue_dedup ON ai_outbound_queue;
CREATE TRIGGER trg_outbound_queue_dedup
  BEFORE INSERT ON ai_outbound_queue
  FOR EACH ROW
  EXECUTE FUNCTION fn_outbound_queue_dedup();

-- ============================================================================
-- 6. pg_cron cleanup (idempotente)
-- ============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule('ai-outbound-queue-cleanup');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job pode nao existir ainda
END;
$$;

SELECT cron.schedule(
  'ai-outbound-queue-cleanup',
  '0 3 * * *',
  $$
  UPDATE ai_outbound_queue
    SET status = 'expired', updated_at = now()
  WHERE status = 'failed'
    AND attempts >= max_attempts
    AND updated_at < now() - INTERVAL '48 hours';

  DELETE FROM ai_outbound_queue
  WHERE status IN ('sent', 'skipped', 'expired')
    AND created_at < now() - INTERVAL '30 days';
  $$
);

-- Notificar PostgREST para recarregar schema cache
NOTIFY pgrst, 'reload schema';
