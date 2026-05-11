-- Migration: automate_status_based_on_stage
-- Description: Automatically updates card status_comercial based on the pipeline stage it is moved to.

CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS TRIGGER AS $$
DECLARE
    v_stage_name text;
    v_stage_fase text;
BEGIN
    -- Get the name and phase of the new stage
    SELECT nome, fase INTO v_stage_name, v_stage_fase
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Logic for 'Viagem Confirmada (Ganho)'
    -- If moving TO this stage, set status to 'ganho'
    IF v_stage_name = 'Viagem Confirmada (Ganho)' THEN
        NEW.status_comercial := 'ganho';
    
    -- Logic for 'Fechado - Perdido'
    -- If moving TO this stage, set status to 'perdido'
    ELSIF v_stage_name = 'Fechado - Perdido' THEN
        NEW.status_comercial := 'perdido';
        
    -- Logic for Post-Sales (Pós-venda)
    -- If already won and moving to post-sales, keep as won (do nothing, or ensure it's won)
    ELSIF v_stage_fase = 'Pós-venda' THEN
        -- Ensure it stays won if it was won, or set to won if it wasn't (e.g. skipped stage)
        -- User said "Need to pass through Viagem Confirmada", but if they skip to Post-Sales, it implies won.
        -- Let's enforce 'ganho' for Pós-venda to be safe.
        NEW.status_comercial := 'ganho';

    -- Logic for Reopening / Moving Back
    -- If moving to any other stage (SDR, Planner before confirmation)
    ELSE
        -- If it was 'ganho' or 'perdido', reset to 'aberto'
        IF OLD.status_comercial IN ('ganho', 'perdido') THEN
            NEW.status_comercial := 'aberto';
        END IF;
        
        -- Ensure new cards or updates in these stages are 'aberto' if not specified
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_card_status_automation();
