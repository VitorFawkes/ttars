-- ============================================================================
-- MIGRATION: future_opportunities.echo_released_at
-- Date: 2026-04-30
--
-- Marker pra idempotência do release no Echo. Quando o
-- future-opportunity-processor reabrir uma conversa no Echo após criar o
-- card novo, salva o timestamp aqui pra que retries do cron não chamem
-- release de novo.
-- ============================================================================

BEGIN;

ALTER TABLE future_opportunities
  ADD COLUMN IF NOT EXISTS echo_released_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN future_opportunities.echo_released_at IS
'Timestamp do POST /conversations/{id}/release no Echo após criação do card novo. Usado pra idempotência do cron diário.';

COMMIT;
