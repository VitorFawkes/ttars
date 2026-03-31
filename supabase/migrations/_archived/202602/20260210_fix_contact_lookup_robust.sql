-- ============================================================
-- MIGRATION: Fix Contact Lookup + Auto Card Creation + Fix RPC
-- Date: 2026-02-10
--
-- Problemas resolvidos:
-- 1. process_whatsapp_raw_event_v2 usava lookup inline quebrado (não lida com 9o dígito)
--    → 91.000+ contatos lixo criados em 1 dia
-- 2. Trigger não criava card para contatos novos (card era criado só pelo n8n)
--    → n8n recebia webhook DEPOIS do trigger, criando contato duplicado
-- 3. get_client_by_phone (RPC do n8n) também usava matching quebrado
-- 4. normalize_contato_meio() usava normalize_phone() (mantém 55 prefix)
--
-- Fixes:
-- a) Trigger usa find_contact_by_whatsapp() (matching robusto com variantes do 9o dígito)
-- b) Trigger cria card + link M:N quando WHATSAPP_CREATE_CARD=true
-- c) get_client_by_phone usa find_contact_by_whatsapp()
-- d) normalize_contato_meio() usa normalize_phone_brazil()
-- e) valor_normalizado existentes recalculados
-- ============================================================

-- ============================================================
-- PARTE 1: Setting para criação automática de card
-- ============================================================
INSERT INTO integration_settings (key, value, description) VALUES
('WHATSAPP_CREATE_CARD', 'true', 'Criar card automaticamente para contatos sem card ativo')
ON CONFLICT (key) DO UPDATE SET value = 'true';

-- ============================================================
-- PARTE 2: Recriar process_whatsapp_raw_event_v2
-- ============================================================
CREATE OR REPLACE FUNCTION process_whatsapp_raw_event_v2(event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_platform RECORD;
    v_linha_config RECORD;
    v_processing_enabled BOOLEAN;
    v_create_contact_enabled BOOLEAN;
    v_create_card_enabled BOOLEAN;
    v_link_to_card_enabled BOOLEAN;
    v_phone TEXT;
    v_phone_normalized TEXT;
    v_phone_no_country TEXT;
    v_contact_id UUID;
    v_card_id UUID;
    v_message_id UUID;
    v_profile_id UUID;
    v_sender_name TEXT;
    v_sender_role TEXT;
    v_body TEXT;
    v_from_me BOOLEAN;
    v_direction TEXT;
    v_timestamp TIMESTAMPTZ;
    v_external_id TEXT;
    v_conversation_id TEXT;
    v_phone_label TEXT;
    v_produto TEXT;
    v_ecko_agent_id TEXT;
    v_ecko_agent_name TEXT;
    v_ecko_agent_email TEXT;
    v_payload jsonb;
    v_data jsonb;
    v_conversation_url TEXT;
BEGIN
    SELECT * INTO v_event FROM whatsapp_raw_events WHERE id = event_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Event not found'); END IF;
    IF v_event.status = 'processed' THEN RETURN jsonb_build_object('error', 'Event already processed', 'status', v_event.status); END IF;

    v_payload := v_event.raw_payload;

    SELECT (value = 'true') INTO v_processing_enabled FROM integration_settings WHERE key = 'WHATSAPP_PROCESS_ENABLED';
    IF v_processing_enabled IS NULL OR v_processing_enabled = false THEN RETURN jsonb_build_object('skipped', true, 'reason', 'Processing disabled'); END IF;

    SELECT * INTO v_platform FROM whatsapp_platforms WHERE id = v_event.platform_id;

    -- ========================================
    -- EXTRACT DATA (provider-specific)
    -- ========================================
    IF v_platform.provider = 'echo' THEN
        v_data := COALESCE(v_payload->'data', v_payload);
        v_phone := v_data->>'contact_phone';
        v_body := v_data->>'text';
        v_from_me := COALESCE((v_data->>'from_me')::boolean, false);
        v_direction := CASE WHEN v_data->>'direction' = 'incoming' THEN 'inbound' WHEN v_data->>'direction' = 'outgoing' THEN 'outbound' WHEN v_from_me THEN 'outbound' ELSE 'inbound' END;
        v_timestamp := COALESCE((v_data->>'ts_iso')::timestamptz, NOW());
        v_external_id := v_data->>'whatsapp_message_id';
        v_conversation_id := COALESCE(v_data->'conversation'->>'id', v_data->>'conversation_id');
        v_sender_name := COALESCE(v_data->'contact'->>'name', v_data->>'contact_name');
        v_phone_label := v_data->>'phone_number';
        v_ecko_agent_id := v_data->'conversation'->'agent'->>'id';
        v_ecko_agent_name := v_data->'conversation'->'agent'->>'name';
        v_ecko_agent_email := v_data->'conversation'->'agent'->>'email';
        IF v_ecko_agent_id IS NULL THEN v_ecko_agent_id := v_data->'conversation'->>'assigned_to'; END IF;
        IF v_conversation_id IS NOT NULL THEN v_conversation_url := 'https://echo-wpp.vercel.app/dashboard/' || v_conversation_id; END IF;
    ELSE
        v_phone := regexp_replace(v_payload->>'contact_jid', '@s\.whatsapp\.net$', '');
        v_body := v_payload->>'text';
        v_from_me := COALESCE((v_payload->>'from_me')::boolean, false);
        v_direction := CASE WHEN v_from_me THEN 'outbound' ELSE 'inbound' END;
        v_timestamp := COALESCE((v_payload->>'ts_iso')::timestamptz, NOW());
        v_external_id := v_payload->>'message_id';
        v_conversation_id := v_payload->>'session_id';
        v_sender_name := v_payload->>'sender_name';
        v_conversation_url := NULL;
    END IF;

    -- ========================================
    -- NORMALIZE PHONE
    -- ========================================
    v_phone_normalized := normalize_phone(v_phone);
    v_phone_no_country := normalize_phone_brazil(v_phone);

    IF v_phone_normalized IS NULL OR v_phone_normalized = '' THEN
        UPDATE whatsapp_raw_events SET status = 'error', error_message = 'No phone number in payload', processed_at = NOW() WHERE id = event_id;
        RETURN jsonb_build_object('error', 'No phone number in payload');
    END IF;

    -- ========================================
    -- LINE CONFIG (produto routing)
    -- ========================================
    IF v_phone_label IS NOT NULL THEN
        SELECT * INTO v_linha_config FROM whatsapp_linha_config WHERE phone_number_label = v_phone_label;
        IF FOUND THEN
            IF NOT v_linha_config.ativo THEN
                UPDATE whatsapp_raw_events SET status = 'ignored', error_message = 'Line configured to ignore', processed_at = NOW() WHERE id = event_id;
                RETURN jsonb_build_object('ignored', true, 'reason', 'Line ' || v_phone_label || ' set to ignore');
            END IF;
            v_produto := v_linha_config.produto;
        END IF;
    END IF;

    -- ========================================
    -- RESOLVE CONTACT (ROBUST - with 9th digit variant support)
    -- Uses normalize_phone_robust() to generate ALL phone format variants
    -- and matches against contato_meios + legacy contatos.telefone
    -- ========================================
    v_contact_id := find_contact_by_whatsapp(v_phone, v_conversation_id);

    -- Update conversation bridge link for found contacts
    IF v_contact_id IS NOT NULL AND v_conversation_id IS NOT NULL AND v_conversation_id <> '' THEN
        UPDATE contatos SET last_whatsapp_conversation_id = v_conversation_id
        WHERE id = v_contact_id
        AND (last_whatsapp_conversation_id IS NULL OR last_whatsapp_conversation_id <> v_conversation_id);
    END IF;

    -- Auto-create contact if not found and enabled
    IF v_contact_id IS NULL THEN
        SELECT (value = 'true') INTO v_create_contact_enabled FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CONTACT';
        IF v_create_contact_enabled = true THEN
            INSERT INTO contatos (nome, telefone, tipo_pessoa, last_whatsapp_conversation_id)
            VALUES (COALESCE(v_sender_name, 'WhatsApp ' || v_phone), v_phone, 'adulto', v_conversation_id)
            RETURNING id INTO v_contact_id;
            INSERT INTO contato_meios (contato_id, tipo, valor, valor_normalizado, is_principal, origem)
            VALUES (v_contact_id, 'whatsapp', v_phone, v_phone_no_country, true, 'whatsapp');
        ELSE
            UPDATE whatsapp_raw_events SET status = 'no_contact', error_message = 'Contact not found and auto-create disabled', processed_at = NOW() WHERE id = event_id;
            RETURN jsonb_build_object('orphan', true, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country);
        END IF;
    END IF;

    -- ========================================
    -- LINK TO CARD (find existing)
    -- ========================================
    SELECT (value = 'true') INTO v_link_to_card_enabled FROM integration_settings WHERE key = 'WHATSAPP_LINK_TO_CARD';
    IF v_link_to_card_enabled = true THEN
        SELECT c.id INTO v_card_id FROM cards c WHERE c.pessoa_principal_id = v_contact_id AND c.status_comercial NOT IN ('ganho', 'perdido') AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 1;
    END IF;

    -- ========================================
    -- AUTO-CREATE CARD (if no active card found)
    -- Uses pipeline_id/stage_id from whatsapp_linha_config
    -- Falls back to Novo Lead stage if not configured
    -- ========================================
    IF v_card_id IS NULL AND v_contact_id IS NOT NULL THEN
        SELECT (value = 'true') INTO v_create_card_enabled FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CARD';
        IF v_create_card_enabled = true THEN
            INSERT INTO cards (titulo, pessoa_principal_id, pipeline_stage_id, pipeline_id, produto, ai_responsavel)
            VALUES (
                'Nova Viagem - ' || COALESCE(v_sender_name, 'WhatsApp'),
                v_contact_id,
                COALESCE(v_linha_config.stage_id, '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9'::uuid),
                v_linha_config.pipeline_id,
                v_produto::app_product,
                'ia'
            ) RETURNING id INTO v_card_id;
            INSERT INTO cards_contatos (card_id, contato_id) VALUES (v_card_id, v_contact_id) ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- ========================================
    -- RESOLVE SENDER PROFILE (outbound messages from Echo agents)
    -- ========================================
    IF v_from_me AND v_ecko_agent_email IS NOT NULL THEN
        SELECT id, nome, role INTO v_profile_id, v_sender_name, v_sender_role FROM profiles WHERE email = v_ecko_agent_email;
    END IF;
    IF v_from_me AND v_profile_id IS NULL AND v_ecko_agent_id IS NOT NULL THEN
        SELECT internal_user_id INTO v_profile_id FROM integration_user_map WHERE external_user_id = v_ecko_agent_id;
        IF v_profile_id IS NOT NULL THEN SELECT nome, role INTO v_sender_name, v_sender_role FROM profiles WHERE id = v_profile_id; END IF;
    END IF;

    -- ========================================
    -- INSERT MESSAGE (with ON CONFLICT for deduplication)
    -- ========================================
    INSERT INTO whatsapp_messages (
        contact_id, card_id, platform_id, raw_event_id, external_id, conversation_id,
        sender_phone, sender_name, direction, is_from_me, body, produto,
        sent_by_user_id, sent_by_user_name, sent_by_user_role, ecko_agent_id, created_at
    )
    VALUES (
        v_contact_id, v_card_id, v_event.platform_id, event_id, v_external_id, v_conversation_id,
        v_phone, v_sender_name, v_direction, v_from_me, v_body, v_produto,
        v_profile_id,
        CASE WHEN v_from_me THEN COALESCE(v_sender_name, v_ecko_agent_name) ELSE NULL END,
        v_sender_role, v_ecko_agent_id, v_timestamp
    )
    ON CONFLICT (platform_id, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
        raw_event_id = COALESCE(EXCLUDED.raw_event_id, whatsapp_messages.raw_event_id),
        card_id = COALESCE(EXCLUDED.card_id, whatsapp_messages.card_id),
        contact_id = COALESCE(EXCLUDED.contact_id, whatsapp_messages.contact_id),
        conversation_id = COALESCE(EXCLUDED.conversation_id, whatsapp_messages.conversation_id),
        sender_name = COALESCE(EXCLUDED.sender_name, whatsapp_messages.sender_name),
        sent_by_user_id = COALESCE(EXCLUDED.sent_by_user_id, whatsapp_messages.sent_by_user_id),
        sent_by_user_name = COALESCE(EXCLUDED.sent_by_user_name, whatsapp_messages.sent_by_user_name),
        sent_by_user_role = COALESCE(EXCLUDED.sent_by_user_role, whatsapp_messages.sent_by_user_role),
        ecko_agent_id = COALESCE(EXCLUDED.ecko_agent_id, whatsapp_messages.ecko_agent_id),
        updated_at = NOW()
    RETURNING id INTO v_message_id;

    -- ========================================
    -- HUMAN TAKEOVER DETECTION
    -- ========================================
    IF v_direction = 'outbound' AND v_from_me AND v_card_id IS NOT NULL AND v_ecko_agent_id IS NOT NULL THEN
        UPDATE cards
        SET ai_responsavel = 'humano', updated_at = NOW()
        WHERE id = v_card_id AND ai_responsavel = 'ia';
    END IF;

    -- ========================================
    -- UPSERT CONVERSATION
    -- ========================================
    IF v_conversation_id IS NOT NULL THEN
        INSERT INTO whatsapp_conversations (contact_id, platform_id, external_conversation_id, external_conversation_url, last_message_at, unread_count, status)
        VALUES (v_contact_id, v_event.platform_id, v_conversation_id, v_conversation_url, v_timestamp, CASE WHEN NOT v_from_me THEN 1 ELSE 0 END, 'open')
        ON CONFLICT (contact_id, platform_id) WHERE platform_id IS NOT NULL
        DO UPDATE SET external_conversation_id = EXCLUDED.external_conversation_id, external_conversation_url = COALESCE(EXCLUDED.external_conversation_url, whatsapp_conversations.external_conversation_url), last_message_at = GREATEST(whatsapp_conversations.last_message_at, EXCLUDED.last_message_at), unread_count = CASE WHEN NOT v_from_me THEN whatsapp_conversations.unread_count + 1 ELSE whatsapp_conversations.unread_count END, updated_at = NOW();
    END IF;

    -- ========================================
    -- MARK RAW EVENT AS PROCESSED
    -- ========================================
    UPDATE whatsapp_raw_events SET status = 'processed', processed_at = NOW(), contact_id = v_contact_id, card_id = v_card_id WHERE id = event_id;

    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'card_id', v_card_id, 'message_id', v_message_id, 'conversation_id', v_conversation_id, 'conversation_url', v_conversation_url, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country, 'direction', v_direction, 'produto', v_produto);

EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events SET status = 'error', error_message = SQLERRM, processed_at = NOW() WHERE id = event_id;
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- PARTE 3: Fix get_client_by_phone (RPC do n8n) com matching robusto
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
        'valor_estimado', v_card.valor_estimado
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================
-- PARTE 4: Fix normalize_contato_meio() para usar normalize_phone_brazil()
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_contato_meio()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo IN ('telefone', 'whatsapp') THEN
        NEW.valor_normalizado := normalize_phone_brazil(NEW.valor);
    ELSIF NEW.tipo = 'email' THEN
        NEW.valor_normalizado := lower(trim(NEW.valor));
    ELSE
        NEW.valor_normalizado := NEW.valor;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PARTE 5: Atualizar valor_normalizado existentes
-- ============================================================

-- Remover duplicatas que conflitariam com a re-normalização
DELETE FROM contato_meios a
USING contato_meios b
WHERE a.tipo = b.tipo
AND a.id > b.id
AND normalize_phone_brazil(a.valor) = b.valor_normalizado;

UPDATE contato_meios
SET valor_normalizado = normalize_phone_brazil(valor)
WHERE tipo IN ('telefone', 'whatsapp')
AND valor IS NOT NULL
AND valor <> '';
