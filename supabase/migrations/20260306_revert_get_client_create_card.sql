-- ============================================================
-- REVERT: get_client_by_phone — remove criação automática de card
-- Restaura versão de 20260305_julia_calendar_tags.sql
-- Quando contato existe sem card ativo → found=true, card_id=null
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
        'mkt_buscando_para_viagem', COALESCE(v_card.mkt_buscando_para_viagem, ''),
        -- produto e sdr_owner_id para Julia
        'produto', COALESCE(v_card.produto, 'TRIPS'),
        'sdr_owner_id', COALESCE(v_card.sdr_owner_id::text, v_card.dono_atual_id::text, '')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
