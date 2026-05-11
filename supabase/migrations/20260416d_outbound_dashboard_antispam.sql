-- ============================================================================
-- MARCO 3: Dashboard Outbound + Anti-spam
-- ============================================================================
-- Fase 2: RPC get_outbound_queue_stats
-- Fase 3: Limite anti-spam por contato (max_outbound_per_contact)
-- Fase 4: Dedup na fila outbound (trigger)
-- Fase 5: Cleanup automatico via pg_cron
-- ============================================================================

-- ============================================================================
-- FASE 2: RPC get_outbound_queue_stats
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

  -- Taxa de sucesso 7 dias
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
-- FASE 3: max_outbound_per_contact em outbound_trigger_config
-- ============================================================================
-- Nao precisa de coluna nova — usa outbound_trigger_config.max_outbound_per_contact (JSONB)
-- Default: 3. O check e feito na edge function + trigger dedup.

-- ============================================================================
-- FASE 4: Dedup na fila outbound
-- ============================================================================
-- Trigger BEFORE INSERT que impede duplicatas (mesmo contato+agente com item pendente)
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
    RETURN NULL; -- cancela INSERT
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
-- FASE 5: Cleanup automatico via pg_cron (diario as 3h UTC = 0h BRT)
-- ============================================================================
-- Job: marca expired + limpa antigos
SELECT cron.schedule(
  'ai-outbound-queue-cleanup',
  '0 3 * * *',
  $$
  -- Marcar como expired: failed com max_attempts atingido e >48h
  UPDATE ai_outbound_queue
    SET status = 'expired', updated_at = now()
  WHERE status = 'failed'
    AND attempts >= max_attempts
    AND updated_at < now() - INTERVAL '48 hours';

  -- Deletar itens finalizados com >30 dias
  DELETE FROM ai_outbound_queue
  WHERE status IN ('sent', 'skipped', 'expired')
    AND created_at < now() - INTERVAL '30 days';
  $$
);

-- Index para acelerar cleanup
CREATE INDEX IF NOT EXISTS idx_outbound_queue_cleanup
  ON ai_outbound_queue(status, updated_at)
  WHERE status IN ('failed', 'sent', 'skipped', 'expired');
