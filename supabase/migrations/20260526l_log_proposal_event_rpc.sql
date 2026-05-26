-- ============================================================================
-- MIGRATION: RPC genérica log_proposal_event
-- Date: 2026-05-26
--
-- Substitui INSERT direto em proposal_events feito pelo frontend público
-- (que falha porque anon não pode executar requesting_org_id() no DEFAULT).
-- Cobre eventos não-críticos como tour_started, tour_step_view, etc.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.log_proposal_event(
    p_proposal_id UUID,
    p_event_type TEXT,
    p_payload JSONB DEFAULT NULL,
    p_recipient_token TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_recipient_id UUID;
BEGIN
    -- Pega org_id da proposta (sem chamar requesting_org_id)
    SELECT org_id INTO v_org_id FROM public.proposals WHERE id = p_proposal_id;
    IF v_org_id IS NULL THEN
        RETURN; -- proposta inexistente, ignora silenciosamente
    END IF;

    -- Se passaram recipient_token, resolve ele pra anexar recipient_id
    IF p_recipient_token IS NOT NULL THEN
        SELECT id INTO v_recipient_id
        FROM public.proposal_recipients
        WHERE recipient_token = p_recipient_token AND proposal_id = p_proposal_id;
    END IF;

    INSERT INTO public.proposal_events (
        proposal_id, org_id, event_type, payload, user_agent, recipient_id
    ) VALUES (
        p_proposal_id,
        v_org_id,
        p_event_type,
        COALESCE(p_payload, '{}'::jsonb),
        p_user_agent,
        v_recipient_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_proposal_event(UUID, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.log_proposal_event(UUID, TEXT, JSONB, TEXT, TEXT) IS
'Loga evento em proposal_events sem precisar de RLS column-level. Cliente público (anon) usa pra registrar tour_*, etc.';

COMMIT;
