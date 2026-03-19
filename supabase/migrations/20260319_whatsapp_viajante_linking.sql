-- ============================================================
-- MIGRATION: Melhoria no card_id linking para viajantes
-- Date: 2026-03-19
--
-- 1. process_whatsapp_raw_event_v2 — remove guard redundante,
--    adiciona matching por produto no fallback viajante
-- 2. Trigger em cards_contatos INSERT para backfill automático
--    de mensagens órfãs quando viajante é adicionado ao card
-- 3. Backfill one-time para mensagens existentes
-- ============================================================

-- ============================================================
-- 1. FUNÇÃO PRINCIPAL ATUALIZADA
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
    v_message_type TEXT;
    v_media_url TEXT;
    v_msg_status TEXT;
    v_msg_has_error BOOLEAN;
    v_msg_error_message TEXT;
    v_status_rows_updated INT;
    v_is_status_fallthrough BOOLEAN DEFAULT false;
    -- Group support
    v_is_group BOOLEAN DEFAULT false;
    v_group_jid TEXT;
    v_group_name TEXT;
    v_group_card_id UUID;
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
        v_message_type := COALESCE(v_data->>'message_type', 'text');
        v_media_url := COALESCE(v_data->'media'->>'url', v_data->>'media_url');

        -- GROUP DETECTION (Echo only)
        v_is_group := COALESCE((v_data->>'is_group')::boolean, false);
        IF v_is_group THEN
            v_group_jid := v_data->'group'->>'jid';
            v_group_name := v_data->'group'->>'name';
        END IF;
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
    -- SHORT-CIRCUIT: STATUS UPDATE EVENTS
    -- ========================================
    IF v_platform.provider = 'echo' AND (v_payload->>'event') = 'message.status' AND v_external_id IS NOT NULL THEN
        v_msg_status := COALESCE(v_data->>'status_name', 'sent');
        v_msg_has_error := COALESCE((v_data->>'error')::boolean, false);
        v_msg_error_message := NULLIF(TRIM(v_data->>'error_message'), '');

        UPDATE whatsapp_messages
        SET
            status = v_msg_status,
            has_error = v_msg_has_error,
            error_message = v_msg_error_message,
            updated_at = NOW()
        WHERE external_id = v_external_id
          AND platform_id = v_event.platform_id;

        GET DIAGNOSTICS v_status_rows_updated = ROW_COUNT;

        IF v_status_rows_updated > 0 THEN
            UPDATE whatsapp_raw_events
            SET status = 'processed', processed_at = NOW()
            WHERE id = event_id;

            RETURN jsonb_build_object(
                'success', true,
                'status_update', true,
                'external_id', v_external_id,
                'new_status', v_msg_status,
                'has_error', v_msg_has_error,
                'error_message', v_msg_error_message,
                'rows_updated', v_status_rows_updated
            );
        END IF;
    END IF;

    -- FIX: Status events que não acharam mensagem existente — marcar para não criar card
    IF v_platform.provider = 'echo'
       AND (v_payload->>'event') = 'message.status'
       AND (v_status_rows_updated IS NULL OR v_status_rows_updated = 0) THEN
        v_is_status_fallthrough := true;
    END IF;

    -- ========================================
    -- IGNORE GROUP CHATS (ChatPro only — Echo sends individual contact_phone)
    -- ========================================
    IF v_platform.provider <> 'echo' AND v_phone LIKE '%@g.us' THEN
        UPDATE whatsapp_raw_events SET status = 'ignored', error_message = 'Group chat message ignored (ChatPro)', processed_at = NOW() WHERE id = event_id;
        RETURN jsonb_build_object('ignored', true, 'reason', 'Group chat (ChatPro)');
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
    -- ADVISORY LOCK (serialize per contact or per group)
    -- ========================================
    IF v_is_group AND v_group_jid IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('whatsapp_group_' || v_group_jid));
    ELSE
        PERFORM pg_advisory_xact_lock(hashtext('whatsapp_phone_' || v_phone_normalized));
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

    -- Auto-create contact if not found and enabled (per-line override > global)
    IF v_contact_id IS NULL THEN
        IF v_linha_config.criar_contato IS NOT NULL THEN
            v_create_contact_enabled := v_linha_config.criar_contato;
        ELSE
            SELECT (value = 'true') INTO v_create_contact_enabled FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CONTACT';
        END IF;
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
        -- GROUP CARD MAPPING: try stored mapping first
        IF v_is_group AND v_group_jid IS NOT NULL THEN
            SELECT card_id INTO v_group_card_id
            FROM whatsapp_groups
            WHERE group_jid = v_group_jid;

            IF v_group_card_id IS NOT NULL THEN
                SELECT id INTO v_card_id FROM cards
                WHERE id = v_group_card_id
                  AND status_comercial NOT IN ('ganho', 'perdido')
                  AND deleted_at IS NULL;

                IF v_card_id IS NULL THEN
                    v_group_card_id := NULL;
                END IF;
            END IF;
        END IF;

        -- ========================================
        -- CARD LOOKUP (always runs — find existing card before considering auto-create)
        -- ========================================
        IF v_card_id IS NULL AND v_contact_id IS NOT NULL THEN
            -- 1) Card onde é contato principal
            SELECT c.id INTO v_card_id FROM cards c
            WHERE c.pessoa_principal_id = v_contact_id
              AND c.status_comercial NOT IN ('ganho', 'perdido')
              AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC LIMIT 1;

            -- 2) Fallback: card onde é viajante (cards_contatos) — prefere match de produto
            IF v_card_id IS NULL THEN
                SELECT c.id INTO v_card_id FROM cards c
                JOIN cards_contatos cc ON cc.card_id = c.id
                WHERE cc.contato_id = v_contact_id
                  AND c.status_comercial NOT IN ('ganho', 'perdido')
                  AND c.deleted_at IS NULL
                ORDER BY
                    CASE WHEN v_produto IS NOT NULL AND c.produto::TEXT = v_produto THEN 0 ELSE 1 END,
                    c.updated_at DESC
                LIMIT 1;
            END IF;
        END IF;

        -- AUTO-CREATE CARD (per-line override > global toggle)
        IF v_card_id IS NULL AND v_contact_id IS NOT NULL THEN
            IF v_linha_config.criar_card IS NOT NULL THEN
                v_create_card_enabled := v_linha_config.criar_card;
            ELSE
                SELECT (value = 'true') INTO v_create_card_enabled
                FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CARD';
            END IF;

            -- Skip card creation if called from retroactive reprocess
            IF v_create_card_enabled = true AND current_setting('app.skip_card_creation', true) = 'true' THEN
                v_create_card_enabled := false;
            END IF;

            -- FIX: Status events que caíram no full processing NUNCA devem criar card
            IF v_create_card_enabled = true AND v_is_status_fallthrough THEN
                v_create_card_enabled := false;
            END IF;

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

        -- STORE GROUP MAPPING (if group message and we found a card, and no prior mapping)
        IF v_is_group AND v_group_jid IS NOT NULL AND v_card_id IS NOT NULL AND v_group_card_id IS NULL THEN
            INSERT INTO whatsapp_groups (group_jid, group_name, card_id, contact_id, platform_id)
            VALUES (v_group_jid, v_group_name, v_card_id, v_contact_id, v_event.platform_id)
            ON CONFLICT (group_jid) DO UPDATE SET
                card_id = EXCLUDED.card_id,
                group_name = COALESCE(EXCLUDED.group_name, whatsapp_groups.group_name),
                updated_at = NOW();
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
    -- ========================================
    INSERT INTO whatsapp_messages (
        contact_id, card_id, platform_id, raw_event_id, external_id, conversation_id,
        sender_phone, sender_name, direction, is_from_me, body, produto,
        sent_by_user_id, sent_by_user_name, sent_by_user_role, ecko_agent_id,
        phone_number_label, fase_label,
        message_type, media_url,
        status, has_error, error_message,
        is_group, group_jid, group_name,
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
        COALESCE(v_msg_status, 'sent'), COALESCE(v_msg_has_error, false), v_msg_error_message,
        v_is_group, v_group_jid, v_group_name,
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
        status = COALESCE(EXCLUDED.status, whatsapp_messages.status),
        has_error = COALESCE(EXCLUDED.has_error, whatsapp_messages.has_error),
        error_message = COALESCE(EXCLUDED.error_message, whatsapp_messages.error_message),
        is_group = COALESCE(EXCLUDED.is_group, whatsapp_messages.is_group),
        group_jid = COALESCE(EXCLUDED.group_jid, whatsapp_messages.group_jid),
        group_name = COALESCE(EXCLUDED.group_name, whatsapp_messages.group_name),
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

    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'card_id', v_card_id, 'message_id', v_message_id, 'conversation_id', v_conversation_id, 'conversation_url', v_conversation_url, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country, 'direction', v_direction, 'produto', v_produto, 'fase_label', v_fase_label, 'message_type', v_message_type, 'card_warning', v_card_error, 'is_group', v_is_group, 'group_jid', v_group_jid, 'group_name', v_group_name);

EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events SET status = 'error', error_message = SQLERRM, processed_at = NOW() WHERE id = event_id;
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- 2. TRIGGER: Backfill automático ao adicionar viajante ao card
-- ============================================================
CREATE OR REPLACE FUNCTION link_viajante_orphan_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card_active BOOLEAN;
    v_updated_count INT;
BEGIN
    -- Verificar se o card está ativo
    SELECT EXISTS(
        SELECT 1 FROM cards
        WHERE id = NEW.card_id
          AND status_comercial NOT IN ('ganho', 'perdido')
          AND deleted_at IS NULL
    ) INTO v_card_active;

    IF NOT v_card_active THEN
        RETURN NEW;
    END IF;

    -- Linkar mensagens órfãs deste contato a este card
    UPDATE whatsapp_messages
    SET card_id = NEW.card_id,
        updated_at = NOW()
    WHERE contact_id = NEW.contato_id
      AND card_id IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Se linkou mensagens, agendar AI extraction
    IF v_updated_count > 0 THEN
        INSERT INTO n8n_ai_extraction_queue (card_id, scheduled_for, message_count)
        VALUES (NEW.card_id, now() + interval '1 minute', v_updated_count)
        ON CONFLICT (card_id) WHERE status = 'pending'
        DO UPDATE SET
            last_message_at = now(),
            scheduled_for = now() + interval '1 minute',
            message_count = n8n_ai_extraction_queue.message_count + EXCLUDED.message_count;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop se existir (para idempotência)
DROP TRIGGER IF EXISTS trg_link_viajante_orphan_messages ON cards_contatos;

CREATE TRIGGER trg_link_viajante_orphan_messages
    AFTER INSERT ON cards_contatos
    FOR EACH ROW
    EXECUTE FUNCTION link_viajante_orphan_messages();

-- ============================================================
-- 3. BACKFILL ONE-TIME: Linkar mensagens órfãs de viajantes existentes
-- ============================================================
DO $$
DECLARE
    v_backfilled INT;
BEGIN
    -- Atualizar mensagens onde o contato é viajante em um card ativo
    WITH viajante_links AS (
        SELECT DISTINCT ON (wm.id)
            wm.id AS message_id,
            cc.card_id
        FROM whatsapp_messages wm
        JOIN cards_contatos cc ON cc.contato_id = wm.contact_id
        JOIN cards c ON c.id = cc.card_id
        WHERE wm.card_id IS NULL
          AND c.deleted_at IS NULL
        ORDER BY wm.id,
            CASE WHEN c.status_comercial NOT IN ('ganho', 'perdido') THEN 0 ELSE 1 END,
            c.updated_at DESC
    )
    UPDATE whatsapp_messages wm
    SET card_id = vl.card_id,
        updated_at = NOW()
    FROM viajante_links vl
    WHERE wm.id = vl.message_id;

    GET DIAGNOSTICS v_backfilled = ROW_COUNT;
    RAISE NOTICE 'Backfill viajante messages: % messages linked', v_backfilled;

    -- Agendar AI extraction para cards que receberam mensagens
    INSERT INTO n8n_ai_extraction_queue (card_id, scheduled_for, message_count)
    SELECT DISTINCT cc.card_id, now() + interval '2 minutes', COUNT(*)
    FROM whatsapp_messages wm
    JOIN cards_contatos cc ON cc.contato_id = wm.contact_id AND cc.card_id = wm.card_id
    JOIN cards c ON c.id = cc.card_id
    WHERE c.status_comercial NOT IN ('ganho', 'perdido')
      AND c.deleted_at IS NULL
      AND wm.is_from_me = false
      AND wm.updated_at >= now() - interval '1 minute'
    GROUP BY cc.card_id
    ON CONFLICT (card_id) WHERE status = 'pending'
    DO UPDATE SET
        last_message_at = now(),
        scheduled_for = now() + interval '2 minutes',
        message_count = n8n_ai_extraction_queue.message_count + EXCLUDED.message_count;
END;
$$;
