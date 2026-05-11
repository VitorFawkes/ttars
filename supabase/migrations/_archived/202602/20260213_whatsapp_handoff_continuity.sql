-- ============================================================
-- MIGRATION: WhatsApp Handoff Continuity (SDR → Vendedora)
-- Date: 2026-02-13
--
-- Contexto:
-- Quando a SDR transfere um lead para a vendedora, o número de
-- atendimento muda no Echo. Precisamos:
-- 1. Que o botão WhatsApp saiba qual conversa abrir (da fase atual)
-- 2. Que o histórico mostre de qual fase veio cada mensagem
--
-- Mudanças:
-- a) Novas colunas em 3 tabelas (só ADDs, sem alterar constraints)
-- b) process_whatsapp_raw_event_v2 grava phone_number_label + fase_label
-- c) Seed whatsapp_phase_instance_map para Echo
-- d) Backfill phone_number_label em conversas existentes
-- ============================================================

-- ============================================================
-- PARTE 1: Novas colunas
-- ============================================================

-- Identificar qual linha gerou a conversa
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS phone_number_label text;

-- Mapear linha → fase no config
ALTER TABLE whatsapp_linha_config
ADD COLUMN IF NOT EXISTS fase_label text,
ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES pipeline_phases(id);

-- Gravar linha e fase em cada mensagem (para indicador no frontend)
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS phone_number_label text,
ADD COLUMN IF NOT EXISTS fase_label text;

-- Index para busca por fase_label no histórico
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_fase_label
ON whatsapp_messages(fase_label) WHERE fase_label IS NOT NULL;

-- ============================================================
-- PARTE 2: Atualizar process_whatsapp_raw_event_v2
-- Mudanças vs versão anterior (20260212):
--   - Nova variável v_fase_label
--   - v_fase_label := v_linha_config.fase_label após LINE CONFIG
--   - INSERT whatsapp_messages inclui phone_number_label, fase_label
--   - UPSERT whatsapp_conversations inclui phone_number_label
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
    v_fase_label TEXT;  -- NOVO: label da fase (SDR, Planner, Pós-Venda)
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
            v_fase_label := v_linha_config.fase_label;  -- NOVO: captura fase da linha
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
    -- NOVO: inclui phone_number_label e fase_label
    -- ========================================
    INSERT INTO whatsapp_messages (
        contact_id, card_id, platform_id, raw_event_id, external_id, conversation_id,
        sender_phone, sender_name, direction, is_from_me, body, produto,
        sent_by_user_id, sent_by_user_name, sent_by_user_role, ecko_agent_id,
        phone_number_label, fase_label,
        created_at
    )
    VALUES (
        v_contact_id, v_card_id, v_event.platform_id, event_id, v_external_id, v_conversation_id,
        v_phone, v_sender_name, v_direction, v_from_me, v_body, v_produto,
        v_profile_id,
        CASE WHEN v_from_me THEN COALESCE(v_sender_name, v_ecko_agent_name) ELSE NULL END,
        v_sender_role, v_ecko_agent_id,
        v_phone_label, v_fase_label,
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
        updated_at = NOW()
    RETURNING id INTO v_message_id;

    -- ========================================
    -- UPSERT CONVERSATION (always runs, even if card op failed)
    -- NOVO: inclui phone_number_label
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

    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'card_id', v_card_id, 'message_id', v_message_id, 'conversation_id', v_conversation_id, 'conversation_url', v_conversation_url, 'phone', v_phone_normalized, 'phone_no_country', v_phone_no_country, 'direction', v_direction, 'produto', v_produto, 'fase_label', v_fase_label, 'card_warning', v_card_error);

EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events SET status = 'error', error_message = SQLERRM, processed_at = NOW() WHERE id = event_id;
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ============================================================
-- PARTE 3: Seed whatsapp_phase_instance_map para Echo
-- (Os seeds existentes são apenas para ChatPro)
-- ============================================================

-- SDR → Echo
INSERT INTO whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT pp.id, wp.id, 2, true
FROM pipeline_phases pp
CROSS JOIN whatsapp_platforms wp
WHERE pp.slug = 'sdr' AND wp.provider = 'echo'
ON CONFLICT (phase_id, platform_id) DO UPDATE SET is_active = true;

-- Planner → Echo
INSERT INTO whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT pp.id, wp.id, 2, true
FROM pipeline_phases pp
CROSS JOIN whatsapp_platforms wp
WHERE pp.slug = 'planner' AND wp.provider = 'echo'
ON CONFLICT (phase_id, platform_id) DO UPDATE SET is_active = true;

-- Pós-Vendas → Echo
INSERT INTO whatsapp_phase_instance_map (phase_id, platform_id, priority, is_active)
SELECT pp.id, wp.id, 2, true
FROM pipeline_phases pp
CROSS JOIN whatsapp_platforms wp
WHERE pp.slug IN ('pos_venda', 'pos-vendas', 'pos_vendas', 'posvendas') AND wp.provider = 'echo'
ON CONFLICT (phase_id, platform_id) DO UPDATE SET is_active = true;

-- ============================================================
-- PARTE 4: Backfill phone_number_label em conversas existentes
-- Pega o phone_number_label da última mensagem de cada contato
-- ============================================================

UPDATE whatsapp_conversations wc
SET phone_number_label = sub.phone_label
FROM (
    SELECT DISTINCT ON (m.contact_id, m.platform_id)
        m.contact_id,
        m.platform_id,
        re.raw_payload->'data'->>'phone_number' as phone_label
    FROM whatsapp_messages m
    JOIN whatsapp_raw_events re ON re.id = m.raw_event_id
    WHERE m.platform_id IS NOT NULL
      AND re.raw_payload->'data'->>'phone_number' IS NOT NULL
    ORDER BY m.contact_id, m.platform_id, m.created_at DESC
) sub
WHERE wc.contact_id = sub.contact_id
AND wc.platform_id = sub.platform_id
AND wc.phone_number_label IS NULL
AND sub.phone_label IS NOT NULL;
