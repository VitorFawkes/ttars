-- Disable transition validation to allow all card movements
CREATE OR REPLACE FUNCTION public.validate_transition(p_card_id uuid, p_target_stage_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Always allow transition
    RETURN true;
END;
$$;
