-- ============================================================
-- MIGRATION: Link Conversation ID to Contact & Robust Matching
-- Date: 2026-01-30
-- Description: Implements "Multi-Variant Exact Match" to safely link contacts
--              without false positives common in fuzzy matching.
-- ============================================================

-- 1. Add the column to contatos (Idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contatos' AND column_name = 'last_whatsapp_conversation_id') THEN
        ALTER TABLE public.contatos ADD COLUMN last_whatsapp_conversation_id text;
    END IF;
END $$;

-- 2. Create an index for fast lookups by conversation_id
CREATE INDEX IF NOT EXISTS idx_contatos_last_whatsapp_convo_id 
ON public.contatos(last_whatsapp_conversation_id);

-- 3. Create a robust phone normalization helper focused on Brazilian rules
--    Generates an ARRAY of all valid formats for a given number.
CREATE OR REPLACE FUNCTION public.normalize_phone_robust(p_phone text)
RETURNS text[] 
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean text;
    v_results text[];
BEGIN
    -- Remove non-digits
    v_clean := regexp_replace(p_phone, '\D', '', 'g');
    
    IF v_clean = '' OR v_clean IS NULL THEN
        RETURN ARRAY[]::text[];
    END IF;

    -- Add the exact clean number
    v_results := ARRAY[v_clean];

    -- Handle Brazil (starts with 55 or has 10-11 digits)
    -- Normalize format: [55] [DDD] [9] [NUMBER]
    
    -- If starts with 55 (Length 12 or 13 usually)
    IF left(v_clean, 2) = '55' THEN
        -- Add version without 55
        v_results := array_append(v_results, substring(v_clean from 3));
        
        -- Handle 9th digit differences for numbers with 55 + DDD
        IF length(v_clean) = 13 AND substring(v_clean from 5 for 1) = '9' THEN
            -- 55 + DDD + 9 + 8digits -> remove the 9 (e.g. 5511988887777 -> 551188887777)
            v_results := array_append(v_results, left(v_clean, 4) || substring(v_clean from 6));
            -- And without 55 + without 9 (e.g. 1188887777)
            v_results := array_append(v_results, substring(v_clean from 3 for 2) || substring(v_clean from 6));
        ELSIF length(v_clean) = 12 THEN
            -- 55 + DDD + 8digits -> add the 9 (e.g. 551188887777 -> 5511988887777)
            v_results := array_append(v_results, left(v_clean, 4) || '9' || substring(v_clean from 5));
            -- And without 55 + with 9 (e.g. 11988887777)
            v_results := array_append(v_results, substring(v_clean from 3 for 2) || '9' || substring(v_clean from 5));
        END IF;
    ELSE
        -- No 55 prefix
        -- Add version WITH 55
        v_results := array_append(v_results, '55' || v_clean);
        
        -- Handle 9th digit for local numbers with DDD (length 10 or 11)
        IF length(v_clean) = 11 AND substring(v_clean from 3 for 1) = '9' THEN
            -- DDD + 9 + 8digits -> remove the 9
            v_results := array_append(v_results, left(v_clean, 2) || substring(v_clean from 4));
            -- And with 55 + without 9
            v_results := array_append(v_results, '55' || left(v_clean, 2) || substring(v_clean from 4));
        ELSIF length(v_clean) = 10 THEN
            -- DDD + 8digits -> add the 9
            v_results := array_append(v_results, left(v_clean, 2) || '9' || substring(v_clean from 3));
            -- And with 55 + with 9
            v_results := array_append(v_results, '55' || left(v_clean, 2) || '9' || substring(v_clean from 3));
        END IF;
    END IF;

    -- Deduplicate results
    SELECT array_agg(DISTINCT x) INTO v_results FROM unnest(v_results) x;

    RETURN v_results;
END;
$$;

-- 4. Create the master lookup function
CREATE OR REPLACE FUNCTION public.find_contact_by_whatsapp(p_phone text, p_convo_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contact_id uuid;
    v_normalized_variants text[];
BEGIN
    -- STEP 1: Try exact match by Conversation ID (Fastest & Most Precise)
    IF p_convo_id IS NOT NULL AND p_convo_id <> '' THEN
        SELECT id INTO v_contact_id 
        FROM public.contatos 
        WHERE last_whatsapp_conversation_id = p_convo_id
        LIMIT 1;
        
        IF v_contact_id IS NOT NULL THEN
            RETURN v_contact_id;
        END IF;
    END IF;

    -- STEP 2: Try Multi-Variant Exact Match
    IF p_phone IS NOT NULL AND p_phone <> '' THEN
        v_normalized_variants := public.normalize_phone_robust(p_phone);
        
        -- Search in contato_meios using variations (Exact match on any variant)
        SELECT cm.contato_id INTO v_contact_id
        FROM public.contato_meios cm
        WHERE cm.tipo IN ('telefone', 'whatsapp')
        AND cm.valor_normalizado = ANY(v_normalized_variants)
        -- Prefer "closer" generic match if multiple found (heuristic)
        ORDER BY length(cm.valor_normalizado) DESC 
        LIMIT 1;

        IF v_contact_id IS NOT NULL THEN
            RETURN v_contact_id;
        END IF;

        -- Fallback to legacy contatos.telefone
        SELECT id INTO v_contact_id
        FROM public.contatos
        WHERE regexp_replace(telefone, '\D', '', 'g') = ANY(v_normalized_variants)
        LIMIT 1;
    END IF;

    RETURN v_contact_id;
END;
$$;

-- 5. Update the process_whatsapp_raw_event_v2 function to use the robust matching
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
        v_conversation_id := v_data->>'conversation_id';
        v_sender_name := v_data->>'contact_name';
        v_phone_label := v_data->>'phone_number';
        
        v_ecko_agent_id := v_data->'conversation'->'agent'->>'id';
        v_ecko_agent_name := v_data->'conversation'->'agent'->>'name';
        v_ecko_agent_email := v_data->'conversation'->'agent'->>'email';
        
        IF v_ecko_agent_id IS NULL THEN
            v_ecko_agent_id := v_data->'conversation'->>'assigned_to';
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
    END IF;
    
    -- 5. Normalize phone (simple version for legacy indices if needed)
    v_phone_normalized := normalize_phone(v_phone);
    
    IF v_phone IS NULL OR v_phone = '' THEN
        UPDATE whatsapp_raw_events 
        SET status = 'error', error_message = 'No phone number in payload', processed_at = NOW()
        WHERE id = event_id;
        RETURN jsonb_build_object('error', 'No phone number in payload');
    END IF;
    
    -- 6. Check linha config
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
    
    -- 7. ROBUST MATCHING (NEW)
    v_contact_id := find_contact_by_whatsapp(v_phone, v_conversation_id);
    
    -- 8. Handle Contact Creation/Update
    IF v_contact_id IS NULL THEN
        SELECT value = 'true' INTO v_toggles FROM integration_settings WHERE key = 'WHATSAPP_CREATE_CONTACT';
        IF v_toggles IS TRUE THEN
            INSERT INTO contatos (nome, telefone, tipo_pessoa, last_whatsapp_conversation_id)
            VALUES (COALESCE(v_sender_name, 'WhatsApp ' || v_phone), v_phone, 'adulto', v_conversation_id)
            RETURNING id INTO v_contact_id;
            
            INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem, valor_normalizado)
            VALUES (v_contact_id, 'whatsapp', v_phone, true, 'whatsapp', normalize_phone(v_phone));
        ELSE
            UPDATE whatsapp_raw_events SET status = 'orphan', error_message = 'Contact not found', processed_at = NOW() WHERE id = event_id;
            RETURN jsonb_build_object('orphan', true, 'phone', v_phone);
        END IF;
    ELSE
        -- Update the bridge link
        IF v_conversation_id IS NOT NULL AND v_conversation_id <> '' THEN
            UPDATE contatos 
            SET last_whatsapp_conversation_id = v_conversation_id
            WHERE id = v_contact_id
            AND (last_whatsapp_conversation_id IS NULL OR last_whatsapp_conversation_id <> v_conversation_id);
        END IF;
    END IF;
    
    -- 9. Find active card
    SELECT value = 'true' INTO v_toggles FROM integration_settings WHERE key = 'WHATSAPP_LINK_TO_CARD';
    IF v_toggles IS TRUE THEN
        SELECT c.id INTO v_card_id FROM cards c
        WHERE c.pessoa_principal_id = v_contact_id AND (v_produto IS NULL OR c.produto = v_produto)
        AND c.status NOT IN ('won', 'lost') ORDER BY c.created_at DESC LIMIT 1;
    END IF;
    
    -- 10. Agent mapping
    IF v_from_me AND v_ecko_agent_email IS NOT NULL THEN
        SELECT id, nome, role INTO v_profile_id, v_sender_name, v_sender_role FROM profiles WHERE email = v_ecko_agent_email;
    END IF;
    
    -- 11. Insert message
    INSERT INTO whatsapp_messages (
        contact_id, card_id, platform_id, raw_event_id, external_id, conversation_id,
        sender_phone, sender_name, direction, is_from_me, body, produto,
        sent_by_user_id, sent_by_user_name, sent_by_user_role, ecko_agent_id, created_at
    ) VALUES (
        v_contact_id, v_card_id, v_event.platform_id, event_id, v_external_id, v_conversation_id,
        v_phone, v_sender_name, v_direction, v_from_me, v_body, v_produto,
        v_profile_id, CASE WHEN v_from_me THEN COALESCE(v_sender_name, v_ecko_agent_name) ELSE NULL END,
        v_sender_role, v_ecko_agent_id, v_timestamp
    ) RETURNING id INTO v_message_id;
    
    -- 12. Update raw event
    UPDATE whatsapp_raw_events SET status = 'processed', processed_at = NOW(), contact_id = v_contact_id, card_id = v_card_id WHERE id = event_id;
    
    RETURN jsonb_build_object('success', true, 'contact_id', v_contact_id, 'message_id', v_message_id);
END;
$$;
