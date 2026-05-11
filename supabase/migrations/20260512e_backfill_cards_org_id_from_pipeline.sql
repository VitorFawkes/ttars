-- ============================================================================
-- BACKFILL: cards.org_id = pipeline.org_id
-- ============================================================================
-- Corrige os cards com org_id inconsistente em relacao ao pipeline.
-- Cenarios cobertos por esta migration:
--   186 cards com card.org_id = "Welcome Trips" + pipeline = "Wedding"
--    34 cards com card.org_id = "Welcome Group" (account!) + pipeline = "Wedding"
-- TOTAL: 220 cards que migram pra Welcome Weddings.
--
-- Os 11 cards inversos (card.org_id = Weddings + pipeline = Trips) NAO
-- sao tocados neste backfill — ficam pra um lote separado caso a caso.
--
-- Origem do bug: integration-process (webhook ActiveCampaign) gravava
-- card.org_id = integrations.org_id (hardcoded Trips) em vez de
-- pipeline.org_id. Migration 20260512f instala trigger preventivo
-- que normaliza dali em diante; migration 20260513 (futura) corrige
-- a fonte no codigo da edge function.
-- ============================================================================

WITH alvo AS (
    SELECT
        c.id,
        c.org_id AS org_antigo,
        p.org_id AS org_correto,
        p.nome AS pipeline_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    JOIN pipelines p ON p.id = ps.pipeline_id
    WHERE c.org_id IS DISTINCT FROM p.org_id
      -- So corrige onde o pipeline e Wedding (pipelines Trips ficam pra dps)
      AND p.org_id = 'b0000000-0000-0000-0000-000000000002'  -- Welcome Weddings
),
upd AS (
    UPDATE cards c
    SET org_id = a.org_correto
    FROM alvo a
    WHERE c.id = a.id
    RETURNING c.id
)
SELECT COUNT(*) AS cards_corrigidos FROM upd;

DO $$
DECLARE
    v_remaining_wedding INT;
    v_remaining_inverso INT;
BEGIN
    -- Verifica cards Wedding ainda inconsistentes (deveria ser 0)
    SELECT COUNT(*) INTO v_remaining_wedding
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    JOIN pipelines p ON p.id = ps.pipeline_id
    WHERE c.org_id <> p.org_id
      AND p.org_id = 'b0000000-0000-0000-0000-000000000002';

    -- Cards Trips com org Weddings (cenario inverso, deixado pra depois)
    SELECT COUNT(*) INTO v_remaining_inverso
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    JOIN pipelines p ON p.id = ps.pipeline_id
    WHERE c.org_id <> p.org_id
      AND p.org_id <> 'b0000000-0000-0000-0000-000000000002';

    RAISE NOTICE 'Cards Wedding com org_id ainda inconsistente apos backfill: %', v_remaining_wedding;
    RAISE NOTICE 'Cards inversos (pipeline Trips com org_id Weddings) intencionalmente preservados: %', v_remaining_inverso;
END $$;
