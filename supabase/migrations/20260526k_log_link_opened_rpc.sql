-- ============================================================================
-- MIGRATION: RPC log_link_opened — unifica abertura de link público
-- Date: 2026-05-26
--
-- Frontend público (anon) chama essa RPC ao carregar /p/{token}.
-- A função é SECURITY DEFINER, então contorna o problema de anon não ter
-- EXECUTE em requesting_org_id() (chamado nos DEFAULTs de proposal_events).
--
-- Comportamento:
--   - Se p_token é um recipient_token: atualiza first_opened_at/last_opened_at
--     do recipient, incrementa open_count, e loga evento com recipient_id.
--   - Se p_token é um public_token legacy: loga só o evento (sem recipient).
--   - Em ambos os casos retorna jsonb com proposal_id + (opcional) recipient info.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.log_link_opened(
    p_token TEXT,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recipient public.proposal_recipients%ROWTYPE;
    v_proposal public.proposals%ROWTYPE;
    v_contato public.contatos%ROWTYPE;
    v_result JSONB;
BEGIN
    -- 1) Resolve como recipient_token primeiro (caminho novo)
    SELECT * INTO v_recipient
    FROM public.proposal_recipients
    WHERE recipient_token = p_token;

    IF FOUND THEN
        SELECT * INTO v_proposal FROM public.proposals WHERE id = v_recipient.proposal_id;
        SELECT * INTO v_contato FROM public.contatos WHERE id = v_recipient.contato_id;

        -- Marca abertura na linha do recipient
        UPDATE public.proposal_recipients
        SET first_opened_at = COALESCE(first_opened_at, now()),
            last_opened_at = now(),
            open_count = open_count + 1
        WHERE id = v_recipient.id;

        -- Loga evento usando org_id da proposta (não chama requesting_org_id)
        INSERT INTO public.proposal_events (
            proposal_id, org_id, event_type, payload, user_agent, recipient_id
        ) VALUES (
            v_proposal.id,
            v_proposal.org_id,
            'link_opened',
            jsonb_build_object('via', 'recipient_token'),
            p_user_agent,
            v_recipient.id
        );

        RETURN jsonb_build_object(
            'proposal_id', v_proposal.id,
            'recipient_id', v_recipient.id,
            'contato_id', v_contato.id,
            'nome', v_contato.nome,
            'sobrenome', v_contato.sobrenome,
            'via', 'recipient_token'
        );
    END IF;

    -- 2) Fallback: public_token legacy
    SELECT * INTO v_proposal FROM public.proposals WHERE public_token = p_token;
    IF FOUND THEN
        INSERT INTO public.proposal_events (
            proposal_id, org_id, event_type, payload, user_agent
        ) VALUES (
            v_proposal.id,
            v_proposal.org_id,
            'link_opened',
            jsonb_build_object('via', 'public_token'),
            p_user_agent
        );

        RETURN jsonb_build_object(
            'proposal_id', v_proposal.id,
            'via', 'public_token'
        );
    END IF;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_link_opened(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.log_link_opened(TEXT, TEXT) IS
'Chamada pelo frontend público quando o cliente abre /p/{token}. Registra abertura no recipient (se aplicável) e loga evento link_opened. Contorna RLS de proposal_events.';

COMMIT;
