-- ============================================================
-- Migration: Julia AC Data + Handoff
-- Adiciona marketing_data e campos AC ao get_client_by_phone
-- Cria RPC julia_request_handoff para handoff invisível
-- ============================================================

-- ============================================================
-- PARTE 1: Atualizar get_client_by_phone com dados AC
-- ============================================================

CREATE OR REPLACE FUNCTION get_client_by_phone(
    p_phone_with_9 TEXT,
    p_phone_without_9 TEXT,
    p_conversation_id TEXT DEFAULT ''
) RETURNS JSONB AS $$
DECLARE
    v_contato_id UUID;
    v_contato RECORD;
    v_card RECORD;
BEGIN
    -- Usar matching robusto (tenta conversation_id primeiro, depois phone)
    v_contato_id := find_contact_by_whatsapp(p_phone_with_9, COALESCE(p_conversation_id, ''));
    IF v_contato_id IS NULL AND p_phone_without_9 IS NOT NULL AND p_phone_without_9 <> p_phone_with_9 THEN
        v_contato_id := find_contact_by_whatsapp(p_phone_without_9, COALESCE(p_conversation_id, ''));
    END IF;

    IF v_contato_id IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT * INTO v_contato FROM contatos WHERE id = v_contato_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    -- Busca card ativo mais recente
    SELECT * INTO v_card FROM cards
    WHERE pessoa_principal_id = v_contato.id
      AND status_comercial NOT IN ('ganho', 'perdido')
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'found', true,
        'id', v_contato.id,
        'nome', COALESCE(v_contato.nome, ''),
        'sobrenome', COALESCE(v_contato.sobrenome, ''),
        'telefone', COALESCE(normalize_phone(v_contato.telefone), ''),
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
        'valor_estimado', v_card.valor_estimado,
        -- Dados ActiveCampaign / Marketing
        'marketing_data', COALESCE(v_card.marketing_data, '{}'::jsonb),
        'briefing_inicial', COALESCE(v_card.briefing_inicial, '{}'::jsonb),
        'origem', COALESCE(v_card.origem, ''),
        'origem_lead', COALESCE(v_card.origem_lead, ''),
        'mkt_buscando_para_viagem', COALESCE(v_card.mkt_buscando_para_viagem, '')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================
-- PARTE 2: RPC julia_request_handoff
-- ============================================================

CREATE OR REPLACE FUNCTION julia_request_handoff(
    p_card_id UUID,
    p_reason TEXT DEFAULT 'outro',
    p_context_summary TEXT DEFAULT ''
) RETURNS JSONB AS $$
DECLARE
    v_card RECORD;
    v_contact RECORD;
BEGIN
    -- Marcar card como handoff para humano
    UPDATE cards
    SET ai_responsavel = 'humano',
        updated_at = NOW()
    WHERE id = p_card_id AND ai_responsavel = 'ia'
    RETURNING * INTO v_card;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'Card not found or already in human mode');
    END IF;

    -- Buscar contato para contexto
    SELECT * INTO v_contact FROM contatos WHERE id = v_card.pessoa_principal_id;

    -- Registrar atividade de handoff
    INSERT INTO activities (card_id, tipo, descricao)
    VALUES (
        p_card_id,
        'handoff',
        'Handoff solicitado pela Julia IA. Motivo: ' || p_reason || '. Contexto: ' || p_context_summary
    );

    RETURN jsonb_build_object(
        'success', true,
        'card_id', p_card_id,
        'contact_name', COALESCE(v_contact.nome, '') || ' ' || COALESCE(v_contact.sobrenome, ''),
        'contact_phone', COALESCE(v_contact.telefone, ''),
        'reason', p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION julia_request_handoff(UUID, TEXT, TEXT) TO service_role;
