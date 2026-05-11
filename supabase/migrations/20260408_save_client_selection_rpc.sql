-- ============================================================================
-- MIGRATION: RPC save_client_selection — permite cliente anon salvar seleções
-- Date: 2026-04-08
--
-- O cliente (sem JWT) acessa /p/:token e pode marcar/desmarcar itens opcionais.
-- Esta RPC valida o token público e faz upsert na proposal_client_selections.
--
-- Segurança: a proposta é encontrada via public_token (não por id direto).
-- Se o token não existe ou a proposta não está em status que permita seleção,
-- a RPC retorna erro sem expor dados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_client_selection(
    p_token TEXT,
    p_item_id UUID,
    p_selected BOOLEAN,
    p_option_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposal_id UUID;
    v_proposal_status TEXT;
BEGIN
    -- Buscar proposta pelo token público
    SELECT id, status INTO v_proposal_id, v_proposal_status
    FROM proposals
    WHERE public_token = p_token
    LIMIT 1;

    IF v_proposal_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Proposta não encontrada');
    END IF;

    -- Permitir seleção apenas em status onde faz sentido
    IF v_proposal_status NOT IN ('sent', 'viewed', 'in_progress') THEN
        RETURN jsonb_build_object('error', 'Proposta não está aberta para seleção');
    END IF;

    -- Upsert na seleção do cliente
    INSERT INTO proposal_client_selections (
        proposal_id,
        item_id,
        option_id,
        selected,
        selection_type,
        updated_at
    ) VALUES (
        v_proposal_id,
        p_item_id,
        p_option_id,
        p_selected,
        'client_toggle',
        now()
    )
    ON CONFLICT (proposal_id, item_id) DO UPDATE SET
        selected = EXCLUDED.selected,
        option_id = EXCLUDED.option_id,
        updated_at = now();

    -- Atualizar status para in_progress se ainda estava em sent/viewed
    IF v_proposal_status IN ('sent', 'viewed') THEN
        UPDATE proposals
        SET status = 'in_progress'
        WHERE id = v_proposal_id;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Permitir que anon chame esta RPC (validação é interna via token)
GRANT EXECUTE ON FUNCTION public.save_client_selection(TEXT, UUID, BOOLEAN, UUID)
    TO anon, authenticated;

COMMENT ON FUNCTION public.save_client_selection IS
'Permite cliente anon salvar seleção de item opcional na proposta via public_token. '
'Valida token internamente, upsert em proposal_client_selections, atualiza status para in_progress.';
