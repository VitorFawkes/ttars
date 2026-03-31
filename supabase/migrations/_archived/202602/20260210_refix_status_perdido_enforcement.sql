-- ============================================================================
-- MIGRATION: Fix status_comercial enforcement + correcao is_won
-- Problems found after database restore (2026-02-10):
--   1. "Viagem Confirmada (Ganho)" has is_won=true (WRONG - only is_planner_won)
--      Ganho Total is ONLY "Viagem Concluída" (Pós-venda)
--   2. 5 cards with status_comercial='perdido' in normal stages
--   3. 8 cards with non-standard status values ('em_andamento','em_aberto','qualificado')
--   4. Trigger function checks OLD instead of NEW (allows violations)
--   5. Trigger missing status_comercial in column list
--
-- Pipeline structure:
--   SDR:       Taxa Paga         → is_sdr_won (marco, status='aberto')
--   Planner:   Viagem Confirmada → is_planner_won ONLY (marco, status='aberto')
--   Pós-venda: Viagem Concluída  → is_won + is_pos_won (GANHO TOTAL, status='ganho')
--   Resolução: Fechado - Perdido → is_lost (status='perdido')
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FIX: Remove is_won from "Viagem Confirmada (Ganho)"
--    This stage is a PLANNER section win, NOT Ganho Total.
--    Only "Viagem Concluída" should have is_won=true.
-- ============================================================================

UPDATE pipeline_stages
SET is_won = false
WHERE id = 'cba42c81-7a3e-40bf-bf66-990d9c09b8d3'
  AND is_won = true;

-- ============================================================================
-- 2. FIX: Move perdido cards in normal stages → Fechado - Perdido
-- ============================================================================

UPDATE cards
SET
    pipeline_stage_id = 'd724a560-f046-4a3f-bebe-4b70917d9283',
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE status_comercial = 'perdido'
  AND deleted_at IS NULL
  AND pipeline_stage_id NOT IN (
      SELECT id FROM pipeline_stages WHERE is_lost = true
  );

-- ============================================================================
-- 3. FIX: Normalize non-standard status values to 'aberto'
--    ('em_andamento', 'em_aberto', 'qualificado' → 'aberto')
-- ============================================================================

UPDATE cards
SET
    status_comercial = 'aberto',
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND status_comercial NOT IN ('aberto', 'ganho', 'perdido');

-- ============================================================================
-- 4. FIX FUNCTION: Enforce status rules on ALL relevant updates
--    Rules:
--    - is_won=true (only Viagem Concluída) → status='ganho'
--    - is_lost=true (Fechado - Perdido) → status='perdido'
--    - ALL other stages → status='aberto' (always)
--    - Section wins (is_sdr_won, is_planner_won, is_pos_won) are independent
--      markers that do NOT change status_comercial
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

    -- GANHO TOTAL: somente Viagem Concluída (is_won=true)
    IF v_stage.is_won = true THEN
        NEW.status_comercial := 'ganho';

    -- PERDA: somente Fechado - Perdido (is_lost=true)
    ELSIF v_stage.is_lost = true THEN
        NEW.status_comercial := 'perdido';

    -- TODOS OS OUTROS STAGES: status SEMPRE 'aberto'
    -- Inclui stages com is_sdr_won e is_planner_won (marcos de seção)
    ELSE
        IF NEW.status_comercial IS NULL OR NEW.status_comercial != 'aberto' THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    -- MARCOS por seção (NÃO alteram status_comercial, apenas marcam o card)
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
-- 5. RECREATE TRIGGER: Fire on both pipeline_stage_id AND status_comercial
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id, status_comercial
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION handle_card_status_automation();

COMMIT;
