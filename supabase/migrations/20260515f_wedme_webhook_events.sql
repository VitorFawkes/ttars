-- Tabela para armazenar webhooks brutos recebidos do wedme.
-- GLOBAL (sem org_id) — segue padrão de webhook_logs. Service-role only.

CREATE TABLE IF NOT EXISTS public.wedme_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type    TEXT,
  payload       JSONB NOT NULL,
  headers       JSONB,
  source_ip     TEXT,
  processed_at  TIMESTAMPTZ,
  process_error TEXT
);

COMMENT ON TABLE public.wedme_webhook_events IS
  'Log cru de webhooks recebidos do wedme. GLOBAL (sem org_id). Service-role only.';

CREATE INDEX IF NOT EXISTS wedme_webhook_events_received_at_idx
  ON public.wedme_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS wedme_webhook_events_event_type_idx
  ON public.wedme_webhook_events (event_type)
  WHERE event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS wedme_webhook_events_unprocessed_idx
  ON public.wedme_webhook_events (received_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.wedme_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedme_webhook_events_service_all ON public.wedme_webhook_events;
CREATE POLICY wedme_webhook_events_service_all
  ON public.wedme_webhook_events
  TO service_role
  USING (true) WITH CHECK (true);
