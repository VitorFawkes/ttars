-- ============================================================================
-- FIX: Remove duplicate mover_card functions causing ambiguity error
-- Error: "Could not choose the best candidate function between..."
-- ============================================================================

-- Drop ALL existing mover_card overloads to eliminate ambiguity
DROP FUNCTION IF EXISTS public.mover_card(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.mover_card(uuid, uuid, uuid, text);

-- Create single unified function with all parameters
CREATE OR REPLACE FUNCTION public.mover_card(
    p_card_id UUID,
    p_nova_etapa_id UUID,
    p_motivo_perda_id UUID DEFAULT NULL,
    p_motivo_perda_comentario TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_valid boolean;
BEGIN
    -- 1. Validate Transition
    v_valid := public.validate_transition(p_card_id, p_nova_etapa_id);

    IF v_valid IS FALSE THEN
        RAISE EXCEPTION 'Transição de etapa não permitida pelas regras de governança.';
    END IF;

    -- 2. Update Card
    UPDATE cards
    SET
        pipeline_stage_id = p_nova_etapa_id,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = now()
    WHERE id = p_card_id;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.mover_card(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mover_card(UUID, UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.mover_card IS 'Moves a card to a new stage with optional loss reason';
