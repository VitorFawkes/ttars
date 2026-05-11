-- ============================================================================
-- MIGRATION: Enforce status_comercial = 'perdido' only on is_lost stages
-- Problem: 122 cards have status_comercial='perdido' but are in normal stages
--          (Apresentação Feita, Tentativa de Contato, etc.)
-- Solution:
--   1. Fix existing violations: move cards to "Fechado - Perdido" stage
--   2. Modify trigger to fire on status_comercial changes too
--   3. Enforce that 'perdido'/'ganho' can only exist on is_lost/is_won stages
-- Date: 2026-02-09
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX EXISTING VIOLATIONS: Move perdido cards to the lost stage
-- ============================================================================

-- Move cards with status_comercial='perdido' that are NOT in a lost stage
-- to the "Fechado - Perdido" stage (d724a560-f046-4a3f-bebe-4b70917d9283)
UPDATE cards
SET
    pipeline_stage_id = 'd724a560-f046-4a3f-bebe-4b70917d9283',
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE status_comercial = 'perdido'
  AND deleted_at IS NULL
  AND pipeline_stage_id != 'd724a560-f046-4a3f-bebe-4b70917d9283'
  AND pipeline_stage_id NOT IN (
      SELECT id FROM pipeline_stages WHERE is_lost = true
  );

-- ============================================================================
-- 2. MODIFY FUNCTION: Enforce status rules on ALL relevant updates
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_stage RECORD;
BEGIN
    -- Buscar dados da nova etapa
    SELECT is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
    INTO v_stage
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Se não encontrou a etapa, manter comportamento padrão
    IF v_stage IS NULL THEN
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
        RETURN NEW;
    END IF;

    -- GANHO TOTAL (status_comercial = 'ganho')
    IF v_stage.is_won = true THEN
        NEW.status_comercial := 'ganho';

    -- PERDA (status_comercial = 'perdido')
    ELSIF v_stage.is_lost = true THEN
        NEW.status_comercial := 'perdido';

    -- ENFORCEMENT: Em etapas normais, NUNCA permitir 'ganho' ou 'perdido'
    ELSE
        IF NEW.status_comercial IN ('ganho', 'perdido') THEN
            NEW.status_comercial := 'aberto';
        END IF;
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    -- MARCOS por seção (não alteram status_comercial, apenas marcam o card)
    IF v_stage.is_sdr_won = true THEN
        IF OLD IS NULL OR OLD.ganho_sdr IS NULL OR OLD.ganho_sdr = false THEN
            NEW.ganho_sdr := true;
            NEW.ganho_sdr_at := NOW();
        END IF;
    END IF;

    IF v_stage.is_planner_won = true THEN
        IF OLD IS NULL OR OLD.ganho_planner IS NULL OR OLD.ganho_planner = false THEN
            NEW.ganho_planner := true;
            NEW.ganho_planner_at := NOW();
        END IF;
    END IF;

    IF v_stage.is_pos_won = true THEN
        IF OLD IS NULL OR OLD.ganho_pos IS NULL OR OLD.ganho_pos = false THEN
            NEW.ganho_pos := true;
            NEW.ganho_pos_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. RECREATE TRIGGER: Fire on both pipeline_stage_id AND status_comercial
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id, status_comercial
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_status_automation();

COMMIT;
