-- ============================================================
-- Fase 1: Trigger para popular historico_fases + Backfill
-- ============================================================
-- historico_fases estava VAZIO. Este migration:
-- 1. Cria trigger que popula automaticamente ao mover cards
-- 2. Backfill de ~1020 registros existentes em activities
-- ============================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION populate_historico_fases()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Só insere se pipeline_stage_id realmente mudou
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        INSERT INTO historico_fases (
            card_id,
            etapa_anterior_id,
            etapa_nova_id,
            mudado_por,
            data_mudanca,
            tempo_na_etapa_anterior
        ) VALUES (
            NEW.id,
            OLD.pipeline_stage_id,
            NEW.pipeline_stage_id,
            auth.uid(),
            now(),
            CASE
                WHEN OLD.stage_entered_at IS NOT NULL
                THEN now() - OLD.stage_entered_at
                ELSE NULL
            END
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Attach trigger (AFTER UPDATE para não interferir com outros triggers)
DROP TRIGGER IF EXISTS trg_populate_historico_fases ON cards;
CREATE TRIGGER trg_populate_historico_fases
    AFTER UPDATE ON cards
    FOR EACH ROW
    WHEN (OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id)
    EXECUTE FUNCTION populate_historico_fases();

-- 3. Indexes para performance das queries de funil
CREATE INDEX IF NOT EXISTS idx_historico_fases_etapa_nova_data
    ON historico_fases (etapa_nova_id, data_mudanca);

CREATE INDEX IF NOT EXISTS idx_historico_fases_etapa_anterior
    ON historico_fases (etapa_anterior_id);

CREATE INDEX IF NOT EXISTS idx_historico_fases_card_data
    ON historico_fases (card_id, data_mudanca);

-- 4. Backfill de activities existentes
-- Popula historico_fases a partir dos registros de stage_changed em activities
-- Filtra apenas registros cujos stage IDs ainda existem em pipeline_stages (FK safety)
INSERT INTO historico_fases (card_id, etapa_anterior_id, etapa_nova_id, mudado_por, data_mudanca)
SELECT
    a.card_id,
    (a.metadata->>'old_stage_id')::UUID,
    (a.metadata->>'new_stage_id')::UUID,
    a.created_by,
    a.created_at
FROM activities a
-- Garantir que new_stage_id existe
JOIN pipeline_stages ps_new ON ps_new.id = (a.metadata->>'new_stage_id')::UUID
-- Garantir que old_stage_id existe (ou é null)
LEFT JOIN pipeline_stages ps_old ON ps_old.id = (a.metadata->>'old_stage_id')::UUID
WHERE a.tipo = 'stage_changed'
  AND (a.metadata->>'new_stage_id') IS NOT NULL
  AND a.card_id IS NOT NULL
  -- old_stage_id deve existir OU ser nulo
  AND ((a.metadata->>'old_stage_id') IS NULL OR ps_old.id IS NOT NULL)
  -- Card deve existir
  AND EXISTS (SELECT 1 FROM cards c WHERE c.id = a.card_id)
  -- Evitar duplicatas se rodar mais de uma vez
  AND NOT EXISTS (
      SELECT 1 FROM historico_fases hf
      WHERE hf.card_id = a.card_id
        AND hf.data_mudanca = a.created_at
        AND hf.etapa_nova_id = (a.metadata->>'new_stage_id')::UUID
  );
