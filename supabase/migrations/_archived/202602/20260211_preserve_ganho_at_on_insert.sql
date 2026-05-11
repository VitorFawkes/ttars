-- ============================================================================
-- Defensive: Preserve pre-set ganho_*_at timestamps on INSERT
-- ============================================================================
-- When importing historical sales, ganho_planner_at is set to the original
-- sale date from the spreadsheet. The trigger should NOT overwrite it with NOW().
-- This change makes the trigger check if NEW.ganho_*_at is already set before
-- overriding. For normal flow (INSERT without pre-set value), NEW.ganho_*_at
-- is NULL → sets NOW() as before. No behavioral change for existing flows.
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
    -- Preservam timestamps pré-setados (ex: importação com data histórica)
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
