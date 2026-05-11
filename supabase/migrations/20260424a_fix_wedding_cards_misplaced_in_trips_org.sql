-- Fix: cards WEDDING criados via webhook AC antigo ficaram com org_id = Welcome Trips
-- mas todo o resto (pipeline, stage) é do Welcome Weddings.
--
-- Consequência: card some no workspace Weddings (RLS filtra por org_id) e
-- também some em Trips (filtro defensivo por produto na UI). Abrir por link
-- direto devolve "não encontrado".
--
-- Critério TRIPLO para mover (sem risco de mexer em card que é Trips de fato):
--   1. produto = 'WEDDING'
--   2. org_id atual = Welcome Trips (b0000000-0000-0000-0000-000000000001)
--   3. pipeline_id = Pipeline Welcome Wedding (f4611f84-ce9c-48ad-814b-dcd6081f15db)
--
-- Prévia prod (2026-04-24): 175 cards, 571 activities, 96 linhas em n8n_ai_extraction_queue.
-- Idempotente: rodar 2x não muda nada na 2ª.

BEGIN;

-- 1. Activities ligadas a esses cards
UPDATE activities a
SET org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
FROM cards c
WHERE a.card_id = c.id
  AND a.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND c.produto = 'WEDDING'
  AND c.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND c.pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'::uuid;

-- 2. Fila de extração IA (histórico já 'sent', mas mantém consistência)
UPDATE n8n_ai_extraction_queue q
SET org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
FROM cards c
WHERE q.card_id = c.id
  AND q.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND c.produto = 'WEDDING'
  AND c.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND c.pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'::uuid;

-- 3. Os cards por último
UPDATE cards
SET org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
WHERE produto = 'WEDDING'
  AND org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db'::uuid;

COMMIT;
