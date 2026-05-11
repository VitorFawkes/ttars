-- ============================================================================
-- TRIGGER PREVENTIVO: cards.org_id sempre = pipeline.org_id
-- ============================================================================
-- Defesa em profundidade: o dispatcher de automacao ja filtra por
-- pipeline.org_id (20260512d), mas isso normaliza cards.org_id pra
-- queries diretas e RLS tambem ficarem corretas.
--
-- Toda vez que um card e inserido ou tem pipeline_stage_id/org_id
-- alterado, o trigger forca NEW.org_id = pipeline.org_id. Funciona
-- pra qualquer fonte (webhook AC, n8n, RPC, admin manual).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cards_force_org_from_pipeline()
RETURNS TRIGGER AS $$
DECLARE
    v_pipeline_org_id UUID;
BEGIN
    -- Sem stage definido, nao temos como resolver — deixa passar.
    IF NEW.pipeline_stage_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT p.org_id INTO v_pipeline_org_id
    FROM pipeline_stages ps
    JOIN pipelines p ON p.id = ps.pipeline_id
    WHERE ps.id = NEW.pipeline_stage_id;

    IF v_pipeline_org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_pipeline_org_id THEN
        RAISE NOTICE 'cards_force_org_from_pipeline: card % org_id ajustado de % para % (do pipeline)',
            COALESCE(NEW.id::TEXT, '<novo>'),
            COALESCE(NEW.org_id::TEXT, 'NULL'),
            v_pipeline_org_id::TEXT;
        NEW.org_id := v_pipeline_org_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cards_force_org_from_pipeline ON cards;

CREATE TRIGGER trg_cards_force_org_from_pipeline
    BEFORE INSERT OR UPDATE OF pipeline_stage_id, org_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION cards_force_org_from_pipeline();

COMMENT ON FUNCTION public.cards_force_org_from_pipeline() IS
'Garante cards.org_id = pipeline.org_id em qualquer INSERT/UPDATE.
Defesa em profundidade — o dispatcher de automacao ja filtra por
pipeline.org_id (migration 20260512d), mas este trigger normaliza
o dado pra queries diretas em cards.org_id e RLS ficarem corretas
tambem. Origem: 186+ cards entraram com org_id errado via webhook
AC (integration-process usando integrations.org_id em vez de
pipeline.org_id).';
