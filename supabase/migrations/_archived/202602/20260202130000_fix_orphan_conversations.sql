-- ============================================================
-- MIGRATION: Fix Orphan WhatsApp Conversations
-- Date: 2026-02-02
-- Description: Creates a utility function to re-scan unlinked conversations
--              and try to match them to contacts using robust phone logic.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fix_orphan_conversations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    r RECORD;
    v_contact_id uuid;
    v_phone text;
    v_count integer := 0;
    v_results jsonb := '[]'::jsonb;
BEGIN
    -- Loop through conversations that are missing a contact_id
    FOR r IN 
        SELECT id, external_conversation_id 
        FROM whatsapp_conversations 
        WHERE contact_id IS NULL
        AND external_conversation_id IS NOT NULL
    LOOP
        -- Assume external_conversation_id contains the phone (e.g. 5511... or 11...)
        v_phone := r.external_conversation_id;
        
        -- Try to find contact using existing robust logic
        -- This logic handles 55 prefix variations
        v_contact_id := find_contact_by_whatsapp(v_phone, r.external_conversation_id);
        
        IF v_contact_id IS NOT NULL THEN
            -- 1. Link the conversation
            UPDATE whatsapp_conversations
            SET contact_id = v_contact_id
            WHERE id = r.id;
            
            -- 2. Link the contact (update the pointer)
            UPDATE contatos
            SET last_whatsapp_conversation_id = r.external_conversation_id
            WHERE id = v_contact_id
            AND last_whatsapp_conversation_id IS NULL; -- Only if not set, or force it? 
            -- Safest to set it if null. dealing with multiple convos is complex, 
            -- but usually the orphan one is the one we want if we are running this fix.
            
            v_count := v_count + 1;
            v_results := v_results || jsonb_build_object(
                'conversation_id', r.external_conversation_id,
                'linked_to_contact', v_contact_id
            );
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'fixed_count', v_count,
        'details', v_results
    );
END;
$$;

-- Execute immediately to fix current issues
SELECT public.fix_orphan_conversations();
