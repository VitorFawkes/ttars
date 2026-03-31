-- ============================================================
-- MIGRATION: Resilient WhatsApp Processing
-- Date: 2026-02-12
--
-- Problemas resolvidos:
-- 1. EXCEPTION WHEN OTHERS faz rollback de TUDO (message, conversation, contact link)
--    → Quando card creation falha, perde message e conversation
-- 2. v_produto NULL quando phone_label não está em whatsapp_linha_config
--    → "null value in column produto violates not-null constraint" (70%+ dos erros)
-- 3. INSERT INTO cards_contatos após auto-criar card com mesmo pessoa_principal_id
--    → Trigger companion rejeita: "Contact X cannot be a companion" (30% dos erros)
-- 4. Group chats (@g.us) processados como contatos regulares
--
-- Fixes:
-- a) Reordena: contact → message → conversation → card (isolado em BEGIN/EXCEPTION)
-- b) v_produto default 'TRIPS' quando NULL
-- c) Remove INSERT cards_contatos redundante
-- d) Ignora group chats (@g.us)
-- e) Reprocessa eventos em erro
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
    v_card_error TEXT;
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
    -- FIX DIRECTION FOR STATUS EVENTS
    -- message.status (delivered/read/failed) are ALWAYS about outbound messages
    -- Echo does NOT include from_me/direction in these payloads
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
                -- NOTE: cards_contatos insert removed - pessoa_principal_id already links contact
                -- The companion trigger would reject this INSERT anyway
            END IF;
        END IF;

        -- HUMAN TAKEOVER DETECTION
        IF v_direction = 'outbound' AND v_from_me AND v_card_id IS NOT NULL AND v_ecko_agent_id IS NOT NULL THEN
            UPDATE cards
            SET ai_responsavel = 'humano', updated_at = NOW()
            WHERE id = v_card_id AND ai_responsavel = 'ia';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Card operations failed, but we continue to save message and conversation
        v_card_error := SQLERRM;
        RAISE NOTICE 'Card operation failed (non-fatal): %', v_card_error;
        v_card_id := NULL; -- Reset card_id since card op failed
    END;

    -- ========================================
    -- INSERT MESSAGE (with ON CONFLICT for deduplication)
    -- This runs OUTSIDE the card isolation block so it always succeeds
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
    -- UPSERT CONVERSATION (always runs, even if card op failed)
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
    UPDATE whatsapp_raw_events SET
        status = CASE WHEN v_card_error IS NOT NULL THEN 'processed' ELSE 'processed' END,
        error_message = CASE WHEN v_card_error IS NOT NULL THEN 'Processed (card op warning: ' || v_card_error || ')' ELSE NULL END,
        processed_at = NOW(),
        contact_id = v_contact_id,
        card_id = v_card_id
    WHERE id = event_id;

    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'card_id', v_card_id, 'message_id', v_message_id, 'conversation_id', v_conversation_id, 'conversation_url', v_conversation_url, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country, 'direction', v_direction, 'produto', v_produto, 'card_warning', v_card_error);

EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events SET status = 'error', error_message = SQLERRM, processed_at = NOW() WHERE id = event_id;
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- PARTE 2: Fix direction for message.status events stored as inbound
-- ============================================================

UPDATE whatsapp_messages m
SET direction = 'outbound',
    is_from_me = true,
    updated_at = NOW()
FROM whatsapp_raw_events e
WHERE m.raw_event_id = e.id
  AND e.event_type = 'message.status'
  AND m.direction = 'inbound'
  AND m.is_from_me = false;

-- ============================================================
-- PARTE 3: Reprocessar eventos em erro
-- ============================================================

DO $$
DECLARE
    v_event RECORD;
    v_result JSONB;
    v_count INTEGER := 0;
    v_success INTEGER := 0;
BEGIN
    FOR v_event IN
        SELECT id FROM whatsapp_raw_events
        WHERE status = 'error'
        AND (
            error_message LIKE '%null value in column "produto"%'
            OR error_message LIKE '%cannot be a companion%'
        )
        ORDER BY created_at
        LIMIT 500
    LOOP
        -- Reset status so function will process it
        UPDATE whatsapp_raw_events
        SET status = 'pending', error_message = NULL, processed_at = NULL
        WHERE id = v_event.id;

        -- Reprocess
        SELECT process_whatsapp_raw_event_v2(v_event.id) INTO v_result;

        v_count := v_count + 1;
        IF v_result->>'success' = 'true' OR v_result->>'ignored' = 'true' THEN
            v_success := v_success + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Reprocessed % events, % successful', v_count, v_success;
END $$;
