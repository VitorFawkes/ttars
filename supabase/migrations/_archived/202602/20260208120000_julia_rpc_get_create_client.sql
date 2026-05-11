-- =============================================================================
-- RPCs para Julia IA: get_client_by_phone + create_user_and_card
-- =============================================================================
-- Substituem Code nodes do n8n que usavam fetch() direto.
-- Agora o n8n chama via HTTP Request com credencial supabaseApi.
-- =============================================================================

-- 1. get_client_by_phone: busca contato por telefone (com/sem 9o dígito)
--    Retorna contato + card ativo (ou found=false se não existir)
CREATE OR REPLACE FUNCTION get_client_by_phone(
    p_phone_with_9 TEXT,
    p_phone_without_9 TEXT
) RETURNS JSONB AS $$
DECLARE
    v_contato_id UUID;
    v_contato RECORD;
    v_card RECORD;
    v_found BOOLEAN := false;
BEGIN
    -- 1. Tenta contato_meios (busca normalizada)
    SELECT cm.contato_id INTO v_contato_id
    FROM contato_meios cm
    WHERE cm.tipo IN ('telefone', 'whatsapp')
      AND (cm.valor_normalizado = p_phone_with_9 OR cm.valor_normalizado = p_phone_without_9)
    LIMIT 1;

    IF v_contato_id IS NOT NULL THEN
        SELECT * INTO v_contato FROM contatos c WHERE c.id = v_contato_id;
        IF FOUND THEN v_found := true; END IF;
    END IF;

    -- 2. Fallback: busca direto em contatos.telefone
    IF NOT v_found THEN
        SELECT * INTO v_contato FROM contatos c
        WHERE c.telefone = p_phone_with_9 OR c.telefone = p_phone_without_9
        LIMIT 1;
        IF FOUND THEN v_found := true; END IF;
    END IF;

    -- 3. Não encontrou → retorna found=false
    IF NOT v_found THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- 4. Busca card ativo mais recente
    SELECT * INTO v_card FROM cards
    WHERE pessoa_principal_id = v_contato.id
      AND status_comercial NOT IN ('won', 'lost')
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    -- 5. Retorna tudo junto
    RETURN jsonb_build_object(
        'found', true,
        'id', v_contato.id,
        'nome', COALESCE(v_contato.nome, ''),
        'sobrenome', COALESCE(v_contato.sobrenome, ''),
        'telefone', COALESCE(v_contato.telefone, ''),
        'email', COALESCE(v_contato.email, ''),
        'cpf', COALESCE(v_contato.cpf, ''),
        'passaporte', COALESCE(v_contato.passaporte, ''),
        'data_nascimento', COALESCE(v_contato.data_nascimento::text, ''),
        'endereco', COALESCE(v_contato.endereco, '{}'::jsonb),
        'observacoes', COALESCE(v_contato.observacoes, ''),
        'card_id', v_card.id,
        'titulo', COALESCE(v_card.titulo, ''),
        'pipeline_stage_id', COALESCE(v_card.pipeline_stage_id::text, ''),
        'ai_resumo', COALESCE(v_card.ai_resumo, ''),
        'ai_contexto', COALESCE(v_card.ai_contexto, ''),
        'ai_responsavel', COALESCE(v_card.ai_responsavel, 'ia'),
        'produto_data', COALESCE(v_card.produto_data, '{}'::jsonb),
        'valor_estimado', v_card.valor_estimado
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 2. create_user_and_card: cria contato + card + link M:N
--    Retorna dados do contato criado + card_id
CREATE OR REPLACE FUNCTION create_user_and_card(
    p_name TEXT,
    p_phone TEXT,
    p_pipeline_stage_id UUID DEFAULT '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9'
) RETURNS JSONB AS $$
DECLARE
    v_contato_id UUID;
    v_card_id UUID;
BEGIN
    -- 1. Cria contato
    INSERT INTO contatos (nome, telefone)
    VALUES (p_name, p_phone)
    RETURNING id INTO v_contato_id;

    -- 2. Cria card vinculado
    INSERT INTO cards (titulo, pessoa_principal_id, pipeline_stage_id, ai_responsavel)
    VALUES ('Nova Viagem - ' || p_name, v_contato_id, p_pipeline_stage_id, 'ia')
    RETURNING id INTO v_card_id;

    -- 3. Cria link M:N
    INSERT INTO cards_contatos (card_id, contato_id)
    VALUES (v_card_id, v_contato_id);

    -- 4. Retorna resultado
    RETURN jsonb_build_object(
        'found', true,
        'created', true,
        'id', v_contato_id,
        'nome', p_name,
        'sobrenome', '',
        'telefone', p_phone,
        'email', '',
        'cpf', '',
        'passaporte', '',
        'data_nascimento', '',
        'endereco', '{}'::jsonb,
        'observacoes', '',
        'card_id', v_card_id,
        'titulo', 'Nova Viagem - ' || p_name,
        'pipeline_stage_id', p_pipeline_stage_id::text,
        'ai_resumo', '',
        'ai_contexto', '',
        'ai_responsavel', 'ia',
        'produto_data', '{}'::jsonb,
        'valor_estimado', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION get_client_by_phone(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_user_and_card(TEXT, TEXT, UUID) TO service_role;

-- Verificação:
--   SELECT get_client_by_phone('5511999887766', '551199887766');
--   SELECT create_user_and_card('Teste', '5500000000000');
