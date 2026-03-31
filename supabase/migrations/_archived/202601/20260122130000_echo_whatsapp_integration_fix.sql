-- ============================================================
-- MIGRATION: Echo WhatsApp Integration Fix
-- Date: 2026-01-22
-- Description: Fixes Echo deep-linking, enables processing, 
--              and enhances conversation tracking
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: UPDATE ECHO PLATFORM CONFIGURATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable deep-linking for Echo conversations
UPDATE whatsapp_platforms 
SET dashboard_url_template = 'https://echo-wpp.vercel.app/dashboard/{conversation_id}',
    capabilities = '{"has_direct_link": true, "requires_instance": false, "supports_user_mapping": false}'::jsonb
WHERE provider = 'echo';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: ADD PLATFORM_ID TO WHATSAPP_CONVERSATIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Add platform_id column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_conversations' 
        AND column_name = 'platform_id'
    ) THEN
        ALTER TABLE whatsapp_conversations ADD COLUMN platform_id uuid REFERENCES whatsapp_platforms(id);
    END IF;
END $$;

-- Create unique constraint for upsert operations
DROP INDEX IF EXISTS idx_whatsapp_conversations_contact_platform;
CREATE UNIQUE INDEX idx_whatsapp_conversations_contact_platform 
ON whatsapp_conversations(contact_id, platform_id) 
WHERE platform_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: MARK OLD EVENTS AS IGNORED (START FRESH)
-- ═══════════════════════════════════════════════════════════════════════════

-- Mark all existing pending events as ignored to start fresh
UPDATE whatsapp_raw_events 
SET status = 'ignored', 
    error_message = 'Batch ignored: Starting fresh per user request (2026-01-22)',
    processed_at = NOW()
WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: ENABLE WHATSAPP PROCESSING
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable processing for new events
UPDATE integration_settings 
SET value = 'true', updated_at = NOW()
WHERE key = 'WHATSAPP_PROCESS_ENABLED';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5: UPDATE PROCESSING FUNCTION WITH CONVERSATION TRACKING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION process_whatsapp_raw_event_v2(event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event RECORD;
    v_platform RECORD;
    v_linha_config RECORD;
    v_toggles RECORD;
    v_phone TEXT;
    v_phone_normalized TEXT;
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
    -- 1. Fetch the raw event
    SELECT * INTO v_event FROM whatsapp_raw_events WHERE id = event_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Event not found');
    END IF;
    
    IF v_event.status = 'processed' THEN
        RETURN jsonb_build_object('error', 'Event already processed', 'status', v_event.status);
    END IF;
    
    v_payload := v_event.raw_payload;
    
    -- 2. Check WHATSAPP_PROCESS_ENABLED toggle
    SELECT value::boolean INTO v_toggles 
    FROM integration_settings 
    WHERE key = 'WHATSAPP_PROCESS_ENABLED';
    
    IF v_toggles IS NULL OR v_toggles.value = false THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'Processing disabled');
    END IF;
    
    -- 3. Get platform info
    SELECT * INTO v_platform FROM whatsapp_platforms WHERE id = v_event.platform_id;
    
    -- 4. Extract data based on platform
    IF v_platform.provider = 'echo' THEN
        -- Echo wraps in 'data' OR sends directly
        v_data := COALESCE(v_payload->'data', v_payload);
        
        v_phone := v_data->>'contact_phone';
        v_body := v_data->>'text';
        v_from_me := COALESCE((v_data->>'from_me')::boolean, false);
        v_direction := CASE 
            WHEN v_data->>'direction' = 'incoming' THEN 'inbound'
            WHEN v_data->>'direction' = 'outgoing' THEN 'outbound'
            WHEN v_from_me THEN 'outbound'
            ELSE 'inbound'
        END;
        v_timestamp := COALESCE((v_data->>'ts_iso')::timestamptz, NOW());
        v_external_id := v_data->>'whatsapp_message_id';
        
        -- Extract conversation ID from nested object or top-level
        v_conversation_id := COALESCE(
            v_data->'conversation'->>'id',
            v_data->>'conversation_id'
        );
        
        v_sender_name := COALESCE(v_data->'contact'->>'name', v_data->>'contact_name');
        v_phone_label := v_data->>'phone_number';
        
        -- Echo agent info
        v_ecko_agent_id := v_data->'conversation'->'agent'->>'id';
        v_ecko_agent_name := v_data->'conversation'->'agent'->>'name';
        v_ecko_agent_email := v_data->'conversation'->'agent'->>'email';
        
        IF v_ecko_agent_id IS NULL THEN
            v_ecko_agent_id := v_data->'conversation'->>'assigned_to';
        END IF;
        
        -- Build conversation URL for Echo
        IF v_conversation_id IS NOT NULL THEN
            v_conversation_url := 'https://echo-wpp.vercel.app/dashboard/' || v_conversation_id;
        END IF;
        
    ELSE
        -- ChatPro format
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
    
    -- 5. Normalize phone
    v_phone_normalized := normalize_phone(v_phone);
    
    IF v_phone_normalized IS NULL OR v_phone_normalized = '' THEN
        UPDATE whatsapp_raw_events 
        SET status = 'error', error_message = 'No phone number in payload', processed_at = NOW()
        WHERE id = event_id;
        RETURN jsonb_build_object('error', 'No phone number in payload');
    END IF;
    
    -- 6. Check linha config (if phone_label provided)
    IF v_phone_label IS NOT NULL THEN
        SELECT * INTO v_linha_config 
        FROM whatsapp_linha_config 
        WHERE phone_number_label = v_phone_label;
        
        IF FOUND THEN
            IF NOT v_linha_config.ativo THEN
                -- Linha is set to IGNORE
                UPDATE whatsapp_raw_events 
                SET status = 'ignored', error_message = 'Line configured to ignore', processed_at = NOW()
                WHERE id = event_id;
                RETURN jsonb_build_object('ignored', true, 'reason', 'Line ' || v_phone_label || ' set to ignore');
            END IF;
            v_produto := v_linha_config.produto;
        END IF;
    END IF;
    
    -- 7. Find contact via contato_meios (primary lookup)
    SELECT cm.contato_id INTO v_contact_id
    FROM contato_meios cm
    WHERE cm.tipo IN ('telefone', 'whatsapp')
    AND cm.valor_normalizado = v_phone_normalized
    LIMIT 1;
    
    -- Fallback: search in contatos.telefone (legacy)
    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id
        FROM contatos
        WHERE normalize_phone(telefone) = v_phone_normalized
        LIMIT 1;
        
        -- If found via legacy, add to contato_meios for future lookups
        IF v_contact_id IS NOT NULL THEN
            INSERT INTO contato_meios (contato_id, tipo, valor, valor_normalizado, is_principal, origem)
            VALUES (v_contact_id, 'whatsapp', v_phone, v_phone_normalized, false, 'whatsapp_auto')
            ON CONFLICT (tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL DO NOTHING;
        END IF;
    END IF;
    
    -- 8. Check CREATE_CONTACT toggle
    IF v_contact_id IS NULL THEN
        SELECT value = 'true' INTO v_toggles 
        FROM integration_settings 
        WHERE key = 'WHATSAPP_CREATE_CONTACT';
        
        IF v_toggles IS TRUE THEN
            -- Create new contact
            INSERT INTO contatos (nome, telefone, tipo_pessoa)
            VALUES (COALESCE(v_sender_name, 'WhatsApp ' || v_phone), v_phone, 'adulto')
            RETURNING id INTO v_contact_id;
            
            -- Also add to contato_meios
            INSERT INTO contato_meios (contato_id, tipo, valor, valor_normalizado, is_principal, origem)
            VALUES (v_contact_id, 'whatsapp', v_phone, v_phone_normalized, true, 'whatsapp');
        ELSE
            -- Log as orphan (no contact found)
            UPDATE whatsapp_raw_events 
            SET status = 'no_contact', error_message = 'Contact not found and auto-create disabled', processed_at = NOW()
            WHERE id = event_id;
            RETURN jsonb_build_object('orphan', true, 'phone', v_phone_normalized);
        END IF;
    END IF;
    
    -- 9. Find active card for this contact
    SELECT value = 'true' INTO v_toggles 
    FROM integration_settings 
    WHERE key = 'WHATSAPP_LINK_TO_CARD';
    
    IF v_toggles IS TRUE THEN
        -- Find most recent active card for this contact with matching produto
        SELECT c.id INTO v_card_id
        FROM cards c
        WHERE c.pessoa_principal_id = v_contact_id
        AND (v_produto IS NULL OR c.produto = v_produto)
        AND c.status NOT IN ('won', 'lost')
        ORDER BY c.created_at DESC
        LIMIT 1;
    END IF;
    
    -- 10. Resolve agent to profile (for outbound messages)
    IF v_from_me AND v_ecko_agent_email IS NOT NULL THEN
        SELECT id, nome, role INTO v_profile_id, v_sender_name, v_sender_role
        FROM profiles
        WHERE email = v_ecko_agent_email;
    END IF;
    
    IF v_from_me AND v_profile_id IS NULL AND v_ecko_agent_id IS NOT NULL THEN
        -- Try integration_user_map
        SELECT internal_user_id INTO v_profile_id
        FROM integration_user_map
        WHERE external_user_id = v_ecko_agent_id;
        
        IF v_profile_id IS NOT NULL THEN
            SELECT nome, role INTO v_sender_name, v_sender_role
            FROM profiles WHERE id = v_profile_id;
        END IF;
    END IF;
    
    -- 11. Insert message
    INSERT INTO whatsapp_messages (
        contact_id,
        card_id,
        platform_id,
        raw_event_id,
        external_id,
        conversation_id,
        sender_phone,
        sender_name,
        direction,
        is_from_me,
        body,
        produto,
        sent_by_user_id,
        sent_by_user_name,
        sent_by_user_role,
        ecko_agent_id,
        created_at
    ) VALUES (
        v_contact_id,
        v_card_id,
        v_event.platform_id,
        event_id,
        v_external_id,
        v_conversation_id,
        v_phone,
        v_sender_name,
        v_direction,
        v_from_me,
        v_body,
        v_produto,
        v_profile_id,
        CASE WHEN v_from_me THEN COALESCE(v_sender_name, v_ecko_agent_name) ELSE NULL END,
        v_sender_role,
        v_ecko_agent_id,
        v_timestamp
    )
    RETURNING id INTO v_message_id;
    
    -- 12. Upsert conversation tracking (NEW!)
    IF v_conversation_id IS NOT NULL THEN
        INSERT INTO whatsapp_conversations (
            contact_id,
            platform_id,
            external_conversation_id,
            external_conversation_url,
            last_message_at,
            unread_count,
            status
        ) VALUES (
            v_contact_id,
            v_event.platform_id,
            v_conversation_id,
            v_conversation_url,
            v_timestamp,
            CASE WHEN NOT v_from_me THEN 1 ELSE 0 END,
            'open'
        )
        ON CONFLICT (contact_id, platform_id) WHERE platform_id IS NOT NULL
        DO UPDATE SET 
            external_conversation_id = EXCLUDED.external_conversation_id,
            external_conversation_url = COALESCE(EXCLUDED.external_conversation_url, whatsapp_conversations.external_conversation_url),
            last_message_at = GREATEST(whatsapp_conversations.last_message_at, EXCLUDED.last_message_at),
            unread_count = CASE 
                WHEN NOT v_from_me THEN whatsapp_conversations.unread_count + 1 
                ELSE whatsapp_conversations.unread_count 
            END,
            updated_at = NOW();
    END IF;
    
    -- 13. Update raw event as processed
    UPDATE whatsapp_raw_events 
    SET status = 'processed', 
        processed_at = NOW(),
        contact_id = v_contact_id,
        card_id = v_card_id
    WHERE id = event_id;
    
    -- 14. Return result
    RETURN jsonb_build_object(
        'success', true,
        'contact_id', v_contact_id,
        'card_id', v_card_id,
        'message_id', v_message_id,
        'conversation_id', v_conversation_id,
        'phone', v_phone_normalized,
        'direction', v_direction,
        'produto', v_produto
    );
    
EXCEPTION WHEN OTHERS THEN
    UPDATE whatsapp_raw_events 
    SET status = 'error', error_message = SQLERRM, processed_at = NOW()
    WHERE id = event_id;
    
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6: CREATE TRIGGER FOR AUTO-PROCESSING
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to auto-process new raw events
CREATE OR REPLACE FUNCTION trigger_process_whatsapp_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Schedule processing asynchronously (pg_net or just mark for processing)
    -- For now, we'll rely on polling via process_pending_whatsapp_events()
    -- but this trigger ensures the event is ready
    RETURN NEW;
END;
$$;

-- Note: Actual auto-processing would require pg_net for async calls
-- For now, processing happens via scheduled function calls

COMMENT ON FUNCTION process_whatsapp_raw_event_v2 IS 'Processes WhatsApp raw events with toggle support, contato_meios lookup, card association, and conversation tracking for Echo deep-linking';
