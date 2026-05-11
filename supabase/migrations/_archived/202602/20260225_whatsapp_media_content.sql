-- ============================================================
-- MIGRATION: WhatsApp Media Content Support
-- Date: 2026-02-25
--
-- Contexto:
-- Mensagens de áudio, imagem e documento chegam pelo WhatsApp
-- mas o conteúdo não é extraído. O RPC não popula message_type
-- nem media_url, impedindo processamento e exibição na UI.
--
-- Mudanças:
-- a) Nova coluna media_content em whatsapp_messages
-- b) process_whatsapp_raw_event_v2 DELTA: adiciona message_type + media_url
--    (preserva TODA lógica existente da versão 20260213)
-- ============================================================

-- ============================================================
-- PARTE 1: Nova coluna para conteúdo extraído de mídia
-- ============================================================

ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS media_content TEXT;

COMMENT ON COLUMN whatsapp_messages.media_content IS
  'Conteúdo extraído de mídia: transcrição de áudio (Whisper), descrição de imagem (Vision), texto de documento (Vision)';

-- Index para buscar mensagens com mídia pendente de processamento
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_pending_media
ON whatsapp_messages(card_id, message_type)
WHERE message_type IN ('audio', 'image', 'document') AND media_content IS NULL AND media_url IS NOT NULL;

-- ============================================================
-- PARTE 2: Atualizar process_whatsapp_raw_event_v2
-- DELTA sobre versão 20260213:
--   - Novas variáveis v_message_type, v_media_url
--   - Extração de message_type e media_url nos paths Echo e ChatPro
--   - INSERT whatsapp_messages inclui message_type, media_url
--   - ON CONFLICT UPDATE inclui message_type, media_url
--   - RETURN inclui message_type
--   PRESERVA TUDO MAIS: group chat filter, phone validation,
--   find_contact_by_whatsapp, contato_meios, pipeline_stage_id, etc.
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
    v_fase_label TEXT;
    v_ecko_agent_id TEXT;
    v_ecko_agent_name TEXT;
    v_ecko_agent_email TEXT;
    v_payload jsonb;
    v_data jsonb;
    v_conversation_url TEXT;
    v_card_error TEXT;
    v_message_type TEXT;   -- NOVO: tipo de mensagem (text, audio, image, document, video)
    v_media_url TEXT;      -- NOVO: URL da mídia (CDN WhatsApp)
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
        -- NOVO: extrair message_type e media_url do payload Echo
        v_message_type := COALESCE(v_data->>'message_type', 'text');
        v_media_url := COALESCE(v_data->'media'->>'url', v_data->>'media_url');
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
        -- NOVO: extrair message_type e media_url do payload ChatPro
        v_message_type := COALESCE(v_payload->>'message_type', v_payload->>'type', 'text');
        v_media_url := v_payload->>'media_url';
    END IF;

    -- Normalizar ptt → audio para consistência
    IF v_message_type = 'ptt' THEN v_message_type := 'audio'; END IF;

    -- ========================================
    -- FIX DIRECTION FOR STATUS EVENTS
    -- ========================================
    IF v_platform.provider = 'echo' AND (v_payload->>'event') IN ('message.status', 'message.sent') THEN
        v_from_me := true;
        v_direction := 'outbound';
    END IF;

    -- ========================================
    -- IGNORE GROUP CHATS (@g.us)
    -- ========================================
    IF v_phone LIKE '%@g.us' THEN
        UPDATE whatsapp_raw_events SET status = 'ignored', error_message = 'Group chat message ignored', processed_at = NOW() WHERE id = event_id;
        RETURN jsonb_build_object('ignored', true, 'reason', 'Group chat');
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
    -- LINE CONFIG (produto + fase routing)
    -- ========================================
    IF v_phone_label IS NOT NULL THEN
        SELECT * INTO v_linha_config FROM whatsapp_linha_config WHERE phone_number_label = v_phone_label;
        IF FOUND THEN
            IF NOT v_linha_config.ativo THEN
                UPDATE whatsapp_raw_events SET status = 'ignored', error_message = 'Line configured to ignore', processed_at = NOW() WHERE id = event_id;
                RETURN jsonb_build_object('ignored', true, 'reason', 'Line ' || v_phone_label || ' set to ignore');
            END IF;
            v_produto := v_linha_config.produto;
            v_fase_label := v_linha_config.fase_label;
        END IF;
    END IF;

    -- ========================================
    -- RESOLVE CONTACT (ROBUST)
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
    -- CARD OPERATIONS (ISOLATED - errors here don't break message/conversation)
    -- ========================================
    BEGIN
        -- LINK TO CARD (find existing)
        SELECT (value = 'true') INTO v_link_to_card_enabled FROM integration_settings WHERE key = 'WHATSAPP_LINK_TO_CARD';
        IF v_link_to_card_enabled = true THEN
            SELECT c.id INTO v_card_id FROM cards c WHERE c.pessoa_principal_id = v_contact_id AND c.status_comercial NOT IN ('ganho', 'perdido') AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 1;
        END IF;

        -- AUTO-CREATE CARD (if no active card found)
        IF v_card_id IS NULL AND v_contact_id IS NOT NULL THEN
            SELECT (value = 'true') INTO v_create_card_enabled FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CARD';
            IF v_create_card_enabled = true THEN
                INSERT INTO cards (titulo, pessoa_principal_id, pipeline_stage_id, pipeline_id, produto, ai_responsavel)
                VALUES (
                    'Nova Viagem - ' || COALESCE(v_sender_name, 'WhatsApp'),
                    v_contact_id,
                    COALESCE(v_linha_config.stage_id, '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9'::uuid),
                    v_linha_config.pipeline_id,
                    COALESCE(v_produto, 'TRIPS')::app_product,
                    'ia'
                ) RETURNING id INTO v_card_id;
            END IF;
        END IF;

        -- HUMAN TAKEOVER DETECTION
        IF v_direction = 'outbound' AND v_from_me AND v_card_id IS NOT NULL AND v_ecko_agent_id IS NOT NULL THEN
            UPDATE cards
            SET ai_responsavel = 'humano', updated_at = NOW()
            WHERE id = v_card_id AND ai_responsavel = 'ia';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_card_error := SQLERRM;
        RAISE NOTICE 'Card operation failed (non-fatal): %', v_card_error;
        v_card_id := NULL;
    END;

    -- ========================================
    -- INSERT MESSAGE (with ON CONFLICT for deduplication)
    -- NOVO: inclui message_type e media_url
    -- ========================================
    INSERT INTO whatsapp_messages (
        contact_id, card_id, platform_id, raw_event_id, external_id, conversation_id,
        sender_phone, sender_name, direction, is_from_me, body, produto,
        sent_by_user_id, sent_by_user_name, sent_by_user_role, ecko_agent_id,
        phone_number_label, fase_label,
        message_type, media_url,
        created_at
    )
    VALUES (
        v_contact_id, v_card_id, v_event.platform_id, event_id, v_external_id, v_conversation_id,
        v_phone, v_sender_name, v_direction, v_from_me, v_body, v_produto,
        v_profile_id,
        CASE WHEN v_from_me THEN COALESCE(v_sender_name, v_ecko_agent_name) ELSE NULL END,
        v_sender_role, v_ecko_agent_id,
        v_phone_label, v_fase_label,
        v_message_type, v_media_url,
        v_timestamp
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
        phone_number_label = COALESCE(EXCLUDED.phone_number_label, whatsapp_messages.phone_number_label),
        fase_label = COALESCE(EXCLUDED.fase_label, whatsapp_messages.fase_label),
        message_type = COALESCE(EXCLUDED.message_type, whatsapp_messages.message_type),
        media_url = COALESCE(EXCLUDED.media_url, whatsapp_messages.media_url),
        updated_at = NOW()
    RETURNING id INTO v_message_id;

    -- ========================================
    -- UPSERT CONVERSATION (always runs, even if card op failed)
    -- ========================================
    IF v_conversation_id IS NOT NULL THEN
        INSERT INTO whatsapp_conversations (contact_id, platform_id, external_conversation_id, external_conversation_url, phone_number_label, last_message_at, unread_count, status)
        VALUES (v_contact_id, v_event.platform_id, v_conversation_id, v_conversation_url, v_phone_label, v_timestamp, CASE WHEN NOT v_from_me THEN 1 ELSE 0 END, 'open')
        ON CONFLICT (contact_id, platform_id) WHERE platform_id IS NOT NULL
        DO UPDATE SET
            external_conversation_id = EXCLUDED.external_conversation_id,
            external_conversation_url = COALESCE(EXCLUDED.external_conversation_url, whatsapp_conversations.external_conversation_url),
            phone_number_label = COALESCE(EXCLUDED.phone_number_label, whatsapp_conversations.phone_number_label),
            last_message_at = GREATEST(whatsapp_conversations.last_message_at, EXCLUDED.last_message_at),
            unread_count = CASE WHEN NOT v_from_me THEN whatsapp_conversations.unread_count + 1 ELSE whatsapp_conversations.unread_count END,
            updated_at = NOW();
    END IF;

    -- ========================================
    -- MARK RAW EVENT AS PROCESSED
    -- ========================================
    UPDATE whatsapp_raw_events SET
        status = 'processed',
        error_message = CASE WHEN v_card_error IS NOT NULL THEN 'Processed (card op warning: ' || v_card_error || ')' ELSE NULL END,
        processed_at = NOW(),
        contact_id = v_contact_id,
        card_id = v_card_id
    WHERE id = event_id;

    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'card_id', v_card_id, 'message_id', v_message_id, 'conversation_id', v_conversation_id, 'conversation_url', v_conversation_url, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country, 'direction', v_direction, 'produto', v_produto, 'fase_label', v_fase_label, 'message_type', v_message_type, 'card_warning', v_card_error);

EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events SET status = 'error', error_message = SQLERRM, processed_at = NOW() WHERE id = event_id;
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
