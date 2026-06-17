-- ============================================================================
-- MIGRATION: nps_webhook_events — landing cru do webhook de ingestão de NPS
-- Date: 2026-06-17
--
-- Completa a pendência registrada em 20260516b_create_nps_tables.sql
-- ("Webhook de ingestão será adicionado depois").
--
-- Estratégia "raw-first": a Edge Function pública `nps-webhook` recebe o
-- payload da ferramenta de pesquisa (Typeform / outra), guarda TUDO cru aqui
-- e responde 200 rápido. A transformação para nps_surveys/nps_responses
-- (matching com card/contato) vem numa fase posterior, lendo as linhas
-- status='pending' desta tabela.
--
-- Segue o padrão das outras tabelas *_webhook_events (calendly/leadster/wedme):
-- per-org (workspace Welcome Trips), RLS per-org + service_role, nunca
-- USING (true) para authenticated.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.nps_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'unknown',   -- ?source= na URL (typeform, etc)
  content_type    TEXT,
  payload         JSONB NOT NULL,
  headers         JSONB,
  source_ip       TEXT,
  idempotency_key TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'    -- pending|processed|failed|ignored (fase 2)
                    CHECK (status IN ('pending','processed','failed','ignored')),
  processed_at    TIMESTAMPTZ,
  error           TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nps_webhook_events IS
  'Landing cru do webhook nps-webhook (ingestão de respostas NPS). Per-org (Welcome Trips). status pending -> transform fase 2 popula nps_surveys/nps_responses.';

CREATE INDEX IF NOT EXISTS idx_nps_webhook_events_org      ON public.nps_webhook_events(org_id);
CREATE INDEX IF NOT EXISTS idx_nps_webhook_events_received ON public.nps_webhook_events(org_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_webhook_events_status   ON public.nps_webhook_events(status) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nps_webhook_events_idem
  ON public.nps_webhook_events(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------------
-- RLS (nunca USING (true) para authenticated — regra de ouro do CLAUDE.md)
-- ------------------------------------------------------------------
ALTER TABLE public.nps_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nps_webhook_events_org_all     ON public.nps_webhook_events;
DROP POLICY IF EXISTS nps_webhook_events_service_all ON public.nps_webhook_events;

CREATE POLICY nps_webhook_events_org_all ON public.nps_webhook_events
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY nps_webhook_events_service_all ON public.nps_webhook_events
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------
-- Grants (PostgREST precisa para detectar a tabela)
-- ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_webhook_events TO authenticated;
GRANT ALL ON public.nps_webhook_events TO service_role;

COMMIT;
