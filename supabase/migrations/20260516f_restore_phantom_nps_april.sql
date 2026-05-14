-- ============================================================================
-- MIGRATION: restaura 1 phantom survey deletado a mais em 20260516e
-- Date: 2026-05-14
--
-- A migration 20260516e deletou 3 phantom surveys (027, 028, 029) ao adicionar
-- as 3 respostas novas (Tiago#2 + 2 outside). Mas como Tiago foi adicionado
-- com source_external_id distinto e os 2 outside também, o total de novas
-- surveys foi +3 e a remoção de phantoms deveria ter sido só -2 pra manter
-- 45 enviadas em abril (29 phantoms originais − 2 + 3 novas = 30+? não... 29 −
-- 2 + 3 = 30 phantoms+reais ≠ 45 total dependendo do que conta).
--
-- Conta correta para 45 surveys em abril:
--   16 do CSV (15 únicos + Tiago#2) + 2 outside + 27 phantoms = 45.
--   Mas 20260516d gerou 29 phantoms e 20260516e deletou 3 → 26 phantoms.
--   Restauramos phantom_027 aqui pra chegar a 27 phantoms.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

INSERT INTO public.nps_surveys
  (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'welcome-trips' LIMIT 1),
  NULL, NULL, 'whatsapp',
  TIMESTAMPTZ '2026-04-15 12:00:00',
  'whatsapp_2026_04_phantom_027',
  TIMESTAMPTZ '2026-04-15 12:00:00'
WHERE EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'welcome-trips')
ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING;

COMMIT;
