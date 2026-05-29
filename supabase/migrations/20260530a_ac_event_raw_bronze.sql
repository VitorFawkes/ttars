-- ============================================================================
-- ac_event_raw — Bronze layer: eventos brutos da ActiveCampaign (append-only)
--
-- Recebido pela edge function ww-ac-webhook-receiver. Cada webhook AC vira
-- 1 linha imutável aqui. Sync incremental processa pending → atualiza
-- ww_ac_deal_funnel_cache. Cron 30min continua como fallback de reconciliação.
--
-- GLOBAL (sem org_id) — Welcome Group é o tenant que recebe webhooks da AC
-- corporativa. Acesso de leitura só pelo workspace Welcome Weddings (mesmo
-- padrão de ww_ac_deal_funnel_cache).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ac_event_raw (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,                     -- deal_add, deal_edit, deal_status_change, contact_add, contact_edit, contact_update_custom_field
  entity_type     TEXT NOT NULL,                     -- 'deal' | 'contact'
  entity_id       TEXT NOT NULL,                     -- id do deal ou contact na AC
  dedup_key       TEXT NOT NULL,                     -- hash composto pra evitar processar webhook duplicado
  payload         JSONB NOT NULL,                    -- corpo bruto do webhook
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,                       -- NULL = ainda na fila
  process_status  TEXT NOT NULL DEFAULT 'pending',   -- pending | processed | error | duplicate | skipped
  process_error   TEXT,                              -- mensagem se status=error
  retry_count     INT NOT NULL DEFAULT 0
);

-- Dedup: AC pode retry o mesmo webhook após timeout. dedup_key = SHA256(event_type|entity_id|timestamp_payload)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ac_event_raw_dedup ON public.ac_event_raw(dedup_key);

-- Índice principal: fila de pending por ordem cronológica
CREATE INDEX IF NOT EXISTS ix_ac_event_raw_pending
  ON public.ac_event_raw(received_at)
  WHERE process_status = 'pending';

-- Lookup por entidade (debug + status check)
CREATE INDEX IF NOT EXISTS ix_ac_event_raw_entity
  ON public.ac_event_raw(entity_type, entity_id, received_at DESC);

-- Lookup por status (monitoring queries)
CREATE INDEX IF NOT EXISTS ix_ac_event_raw_status
  ON public.ac_event_raw(process_status, received_at DESC);

COMMENT ON TABLE public.ac_event_raw IS
  'Bronze layer: eventos brutos da ActiveCampaign via webhook. Append-only. Sync incremental processa pending. Cron 30min continua como reconciliação fallback. GLOBAL — leitura por workspace Welcome Weddings via RPC.';

COMMENT ON COLUMN public.ac_event_raw.dedup_key IS
  'Hash composto (event_type|entity_id|timestamp). Garante idempotência se AC retransmitir o mesmo webhook após timeout.';

COMMENT ON COLUMN public.ac_event_raw.process_status IS
  'pending = na fila / processed = sync aplicado com sucesso / error = sync falhou (ver process_error) / duplicate = dedup_key conflito (ignorado) / skipped = evento irrelevante (ex: contact que não é wedding)';

-- ============================================================================
-- RLS — escrita só via service_role (edge function). Leitura pelo workspace
-- Welcome Weddings (mesmo padrão de ww_ac_deal_funnel_cache).
-- ============================================================================

ALTER TABLE public.ac_event_raw ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ac_event_raw_service_all ON public.ac_event_raw;
CREATE POLICY ac_event_raw_service_all ON public.ac_event_raw
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ac_event_raw_ww_read ON public.ac_event_raw;
CREATE POLICY ac_event_raw_ww_read ON public.ac_event_raw
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = requesting_org_id()
        AND (o.slug = 'welcome-weddings'
             OR o.parent_org_id IN (SELECT id FROM organizations WHERE slug = 'welcome-group'))
    )
  );

-- ============================================================================
-- Retention: cleanup automático de eventos processados > 90 dias
-- (rastreio é manter histórico de 90 dias pra forensics, mais que isso ocupa espaço)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ac_event_raw_cleanup_old()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM ac_event_raw
   WHERE processed_at IS NOT NULL
     AND processed_at < NOW() - INTERVAL '90 days'
     AND process_status IN ('processed', 'duplicate', 'skipped');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$func$;

COMMENT ON FUNCTION public.ac_event_raw_cleanup_old IS
  'Remove eventos processados com sucesso > 90 dias. Eventos com erro são mantidos pra investigação. Rodar via pg_cron diário.';

-- ============================================================================
-- Helper RPC para o webhook receiver: insert atômico com dedup
-- Retorna o id inserido, ou NULL se já existia (idempotência).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ac_event_raw_insert(
  p_event_type  TEXT,
  p_entity_type TEXT,
  p_entity_id   TEXT,
  p_dedup_key   TEXT,
  p_payload     JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO ac_event_raw(event_type, entity_type, entity_id, dedup_key, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_dedup_key, p_payload)
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;  -- NULL se já existia
END;
$func$;

GRANT EXECUTE ON FUNCTION public.ac_event_raw_insert(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================================
-- RPC: pega próximos N eventos pending pra processar (FOR UPDATE SKIP LOCKED
-- garante que workers concorrentes não pegam o mesmo evento)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ac_event_raw_claim_pending(p_limit INT DEFAULT 50)
RETURNS SETOF ac_event_raw
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
      FROM ac_event_raw
     WHERE process_status = 'pending'
     ORDER BY received_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE ac_event_raw e
     SET process_status = 'pending',  -- mantém pending mas marca claim via FOR UPDATE
         retry_count = e.retry_count
    FROM claimed
   WHERE e.id = claimed.id
  RETURNING e.*;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.ac_event_raw_claim_pending(INT) TO service_role;

-- ============================================================================
-- RPC: marca evento como processado (idempotente)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ac_event_raw_mark_processed(
  p_id     BIGINT,
  p_status TEXT,          -- processed | error | skipped
  p_error  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
BEGIN
  UPDATE ac_event_raw
     SET process_status = p_status,
         processed_at   = NOW(),
         process_error  = p_error,
         retry_count    = CASE WHEN p_status = 'error' THEN retry_count + 1 ELSE retry_count END
   WHERE id = p_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.ac_event_raw_mark_processed(BIGINT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- View pra monitoramento (Vitor roda manualmente 1×/semana)
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_ac_event_health AS
SELECT
  date_trunc('hour', received_at) AS hora,
  event_type,
  process_status,
  COUNT(*) AS qtd,
  COUNT(*) FILTER (WHERE process_status = 'error') AS erros,
  MAX(received_at) AS ultimo_evento
FROM ac_event_raw
WHERE received_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

GRANT SELECT ON public.vw_ac_event_health TO authenticated;

COMMENT ON VIEW public.vw_ac_event_health IS
  'Resumo dos últimos 7 dias de webhooks AC por hora/tipo/status. Vitor consulta 1×/semana pra ver se webhook continua chegando e taxa de erros.';
