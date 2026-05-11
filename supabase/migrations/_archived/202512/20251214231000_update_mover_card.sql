CREATE OR REPLACE FUNCTION mover_card(
  p_card_id uuid,
  p_nova_etapa_id uuid,
  p_motivo_perda_id uuid default null
)
RETURNS void AS $$
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
        updated_at = now()
    WHERE id = p_card_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
