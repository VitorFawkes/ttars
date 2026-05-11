-- ============================================================================
-- MIGRATION: Auto-Avanço de Etapas
-- Date: 2026-03-19
--
-- Adiciona coluna auto_advance em pipeline_stages e trigger AFTER que
-- move o card automaticamente para a próxima etapa ativa quando entra
-- em uma etapa com auto_advance=true.
--
-- Caso de uso: etapas de marco (Ganho SDR, Ganho Planner) onde o card
-- não deve permanecer — ele registra o marco e avança.
--
-- Ordem de triggers:
--   1. BEFORE: handle_card_status_automation → seta ganho_sdr/planner, status
--   2. UPDATE é gravado
--   3. AFTER: handle_card_auto_advance → avança para próxima etapa
-- ============================================================================

BEGIN;

-- 1. Nova coluna
ALTER TABLE pipeline_stages
ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pipeline_stages.auto_advance IS
  'Quando true, cards que entram nesta etapa avançam automaticamente para a próxima etapa ativa.';

-- 2. Function AFTER trigger
CREATE OR REPLACE FUNCTION public.handle_card_auto_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_stage RECORD;
    v_current_phase_order INT;
    v_next_stage_id UUID;
BEGIN
    -- Guarda de recursão: impede loop infinito se próxima etapa também tiver auto_advance
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    -- Só atua quando pipeline_stage_id realmente mudou
    IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN
        RETURN NULL;
    END IF;

    -- Buscar dados da nova etapa
    SELECT s.auto_advance, s.pipeline_id, s.ordem, s.phase_id
    INTO v_stage
    FROM pipeline_stages s
    WHERE s.id = NEW.pipeline_stage_id;

    IF v_stage IS NULL OR v_stage.auto_advance IS NOT TRUE THEN
        RETURN NULL;
    END IF;

    -- Buscar order_index da fase atual
    SELECT COALESCE(ph.order_index, 999)
    INTO v_current_phase_order
    FROM pipeline_phases ph
    WHERE ph.id = v_stage.phase_id;

    IF v_current_phase_order IS NULL THEN
        v_current_phase_order := 999;
    END IF;

    -- Encontrar próxima etapa ativa em ordem de pipeline
    -- Ordem: phase.order_index ASC, stage.ordem ASC
    SELECT s.id INTO v_next_stage_id
    FROM pipeline_stages s
    LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
    WHERE s.pipeline_id = v_stage.pipeline_id
      AND s.ativo = true
      AND s.id != NEW.pipeline_stage_id
      AND (
          COALESCE(ph.order_index, 999) > v_current_phase_order
          OR (
              COALESCE(ph.order_index, 999) = v_current_phase_order
              AND s.ordem > v_stage.ordem
          )
      )
    ORDER BY COALESCE(ph.order_index, 999), s.ordem
    LIMIT 1;

    -- Se não há próxima etapa, card permanece
    IF v_next_stage_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Avançar o card
    UPDATE cards
    SET pipeline_stage_id = v_next_stage_id,
        updated_at = NOW()
    WHERE id = NEW.id;

    RETURN NULL; -- Retorno de AFTER trigger é ignorado
END;
$fn$;

-- 3. Criar trigger AFTER
DROP TRIGGER IF EXISTS trigger_card_auto_advance ON cards;

CREATE TRIGGER trigger_card_auto_advance
    AFTER UPDATE OF pipeline_stage_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_auto_advance();

COMMIT;
