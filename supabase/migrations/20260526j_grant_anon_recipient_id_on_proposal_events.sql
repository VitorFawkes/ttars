-- ============================================================================
-- MIGRATION: GRANT INSERT em proposal_events.recipient_id pra anon
-- Date: 2026-05-26
--
-- A coluna recipient_id foi criada em 20260526i mas o GRANT é column-level
-- (por convenção do projeto, anon só tem grant explícito por coluna em
-- proposal_events). Sem isso, INSERT do cliente público com recipient_id
-- volta 401.
-- ============================================================================

BEGIN;

GRANT INSERT (recipient_id) ON public.proposal_events TO anon;
GRANT INSERT (recipient_id) ON public.proposal_events TO authenticated;
GRANT UPDATE (recipient_id) ON public.proposal_events TO authenticated;

COMMIT;
