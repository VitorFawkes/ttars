-- ============================================================================
-- MIGRATION: Revert status_comercial para is_planner_won
-- Date: 2026-03-06
--
-- Reverte 20260305_fix_ganho_planner_won.sql
-- Regra correta: status_comercial='ganho' SOMENTE em is_won=true (Viagem Concluída)
-- is_planner_won=true (Viagem Confirmada) = marco do Planner, status='aberto'
-- ============================================================================

BEGIN;

-- 1. TRIGGER: Restaurar versão original (is_planner_won NÃO seta ganho)
CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_stage RECORD;
BEGIN
    SELECT is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
    INTO v_stage
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    IF v_stage IS NULL THEN
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
        RETURN NEW;
    END IF;

    -- GANHO TOTAL: somente stages com is_won=true (Viagem Concluída)
    IF v_stage.is_won = true THEN
        NEW.status_comercial := 'ganho';
        IF NEW.data_fechamento IS NULL THEN
            NEW.data_fechamento := CURRENT_DATE;
        END IF;

    ELSIF v_stage.is_lost = true THEN
        NEW.status_comercial := 'perdido';
        IF NEW.data_fechamento IS NULL THEN
            NEW.data_fechamento := CURRENT_DATE;
        END IF;

    ELSE
        IF NEW.status_comercial IS NULL
           OR NEW.status_comercial NOT IN ('aberto', 'pausado') THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    -- Marcos (não alteram status_comercial)
    IF v_stage.is_sdr_won = true THEN
        IF OLD IS NULL OR OLD.ganho_sdr IS NULL OR OLD.ganho_sdr = false THEN
            NEW.ganho_sdr := true;
            IF NEW.ganho_sdr_at IS NULL THEN
                NEW.ganho_sdr_at := NOW();
            END IF;
        END IF;
    END IF;

    IF v_stage.is_planner_won = true THEN
        IF OLD IS NULL OR OLD.ganho_planner IS NULL OR OLD.ganho_planner = false THEN
            NEW.ganho_planner := true;
            IF NEW.ganho_planner_at IS NULL THEN
                NEW.ganho_planner_at := NOW();
            END IF;
        END IF;
    END IF;

    IF v_stage.is_pos_won = true THEN
        IF OLD IS NULL OR OLD.ganho_pos IS NULL OR OLD.ganho_pos = false THEN
            NEW.ganho_pos := true;
            IF NEW.ganho_pos_at IS NULL THEN
                NEW.ganho_pos_at := NOW();
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. BACKFILL: Reverter cards em is_planner_won de ganho → aberto
-- Touch status_comercial para disparar trigger (que agora força 'aberto')
UPDATE cards c
SET status_comercial = 'ganho'
FROM pipeline_stages s
WHERE c.pipeline_stage_id = s.id
  AND s.is_planner_won = true
  AND c.status_comercial = 'ganho'
  AND c.deleted_at IS NULL;

-- Limpar data_fechamento setada indevidamente (só se não tinha antes)
UPDATE cards c
SET data_fechamento = NULL
FROM pipeline_stages s
WHERE c.pipeline_stage_id = s.id
  AND s.is_planner_won = true
  AND c.data_fechamento = '2026-03-06'
  AND c.deleted_at IS NULL;

COMMIT;
