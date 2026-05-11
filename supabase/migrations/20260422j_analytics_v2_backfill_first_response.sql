-- Analytics v2 — Fase 0 (Backfill: first_response_at)
-- Plano: Bloco 8.
--
-- Deriva first_response_at a partir da menor created_at de whatsapp_messages
-- outbound por card. Idempotente (so popula onde ainda esta NULL).

BEGIN;

SET LOCAL session_replication_role = 'replica';

UPDATE public.cards c
SET first_response_at = fr.min_outbound_at
FROM (
  SELECT card_id, MIN(created_at) AS min_outbound_at
    FROM public.whatsapp_messages
   WHERE direction = 'outbound'
     AND card_id IS NOT NULL
   GROUP BY card_id
) fr
WHERE c.id = fr.card_id
  AND c.deleted_at IS NULL
  AND c.first_response_at IS NULL;

COMMIT;
