-- Fix: RPCs que insert sem org_id quando chamadas por agentes IA (service_role)
-- ou por cliente externo (anon sem JWT).
--
-- Corrigidas:
--   1. agent_assign_tag — rewrite completo (referenciava tabela 'tags' que nao existe).
--      Usa card_tags (catalogo) + card_tag_assignments (link).
--   2. julia_assign_tag — INSERT em card_tags agora passa org_id derivado do card.
--   3. save_client_selection — INSERT em proposal_client_selections agora passa
--      org_id derivado da proposal.

-- ============================================================
-- 1. agent_assign_tag
-- ============================================================
CREATE OR REPLACE FUNCTION public.agent_assign_tag(
  p_card_id UUID,
  p_tag_name TEXT,
  p_tag_color TEXT DEFAULT '#6366f1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_id UUID;
  v_org_id UUID;
  v_produto TEXT;
BEGIN
  SELECT org_id, produto::TEXT INTO v_org_id, v_produto
  FROM cards
  WHERE id = p_card_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_not_found');
  END IF;

  -- Busca tag existente (case-insensitive, mesma org, shared ou mesmo produto)
  SELECT id INTO v_tag_id
  FROM card_tags
  WHERE LOWER(name) = LOWER(p_tag_name)
    AND org_id = v_org_id
    AND (produto IS NULL OR produto = v_produto)
    AND is_active = true
  ORDER BY produto NULLS LAST
  LIMIT 1;

  -- Cria tag se nao existe, passando org_id explicito
  IF v_tag_id IS NULL THEN
    INSERT INTO card_tags (name, color, produto, is_active, org_id)
    VALUES (p_tag_name, p_tag_color, NULL, true, v_org_id)
    RETURNING id INTO v_tag_id;
  END IF;

  -- Link card <-> tag (org_id resolvido via BEFORE trigger existente em card_tag_assignments)
  INSERT INTO card_tag_assignments (card_id, tag_id)
  VALUES (p_card_id, v_tag_id)
  ON CONFLICT (card_id, tag_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'tag_id', v_tag_id,
    'tag_name', p_tag_name
  );
END;
$$;

-- ============================================================
-- 2. julia_assign_tag
-- ============================================================
CREATE OR REPLACE FUNCTION public.julia_assign_tag(
    p_card_id UUID,
    p_tag_name TEXT,
    p_tag_color TEXT DEFAULT '#ef4444'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tag_id UUID;
    v_produto TEXT;
    v_org_id UUID;
BEGIN
    SELECT produto::TEXT, org_id INTO v_produto, v_org_id
    FROM cards WHERE id = p_card_id;

    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'card_not_found');
    END IF;

    SELECT id INTO v_tag_id
    FROM card_tags
    WHERE LOWER(name) = LOWER(p_tag_name)
      AND org_id = v_org_id
      AND (produto IS NULL OR produto = v_produto)
      AND is_active = true
    ORDER BY produto NULLS LAST
    LIMIT 1;

    IF v_tag_id IS NULL THEN
        INSERT INTO card_tags (name, color, produto, is_active, org_id)
        VALUES (p_tag_name, p_tag_color, NULL, true, v_org_id)
        RETURNING id INTO v_tag_id;
    END IF;

    INSERT INTO card_tag_assignments (card_id, tag_id)
    VALUES (p_card_id, v_tag_id)
    ON CONFLICT (card_id, tag_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'tag_id', v_tag_id,
        'tag_name', p_tag_name,
        'card_id', p_card_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.julia_assign_tag(UUID, TEXT, TEXT) TO service_role;

-- ============================================================
-- 3. save_client_selection
-- ============================================================
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
    v_proposal_org_id UUID;
BEGIN
    SELECT id, status, org_id
      INTO v_proposal_id, v_proposal_status, v_proposal_org_id
    FROM proposals
    WHERE public_token = p_token
    LIMIT 1;

    IF v_proposal_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Proposta não encontrada');
    END IF;

    IF v_proposal_status NOT IN ('sent', 'viewed', 'in_progress') THEN
        RETURN jsonb_build_object('error', 'Proposta não está aberta para seleção');
    END IF;

    INSERT INTO proposal_client_selections (
        proposal_id,
        item_id,
        option_id,
        selected,
        selection_type,
        updated_at,
        org_id
    ) VALUES (
        v_proposal_id,
        p_item_id,
        p_option_id,
        p_selected,
        'client_toggle',
        now(),
        v_proposal_org_id
    )
    ON CONFLICT (proposal_id, item_id) DO UPDATE SET
        selected = EXCLUDED.selected,
        option_id = EXCLUDED.option_id,
        updated_at = now();

    IF v_proposal_status IN ('sent', 'viewed') THEN
        UPDATE proposals
        SET status = 'in_progress'
        WHERE id = v_proposal_id;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_client_selection(TEXT, UUID, BOOLEAN, UUID) TO anon, authenticated;
