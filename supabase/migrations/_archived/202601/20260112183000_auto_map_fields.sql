-- Auto-Mapping Script for WhatsApp Providers
-- Description: Automatically maps standard JSON fields to CRM internal fields for ChatPro and Echo.
-- Instructions: Run this in Supabase SQL Editor.

-- ============================================
-- 1. CHATPRO MAPPINGS
-- ============================================
INSERT INTO public.whatsapp_field_mappings (platform_id, external_path, internal_field, transform_type)
SELECT 
    p.id,
    m.external_path,
    m.internal_field,
    m.transform_type
FROM public.whatsapp_platforms p
CROSS JOIN (
    VALUES 
        -- Core Fields
        ('contact_number', 'sender_phone', 'normalize_phone'),
        ('text', 'body', 'direct'),
        ('message_id', 'external_id', 'direct'),
        
        -- Metadata
        ('direction', 'direction', 'map_direction'),
        ('ts_iso', 'created_at', 'parse_timestamp'),
        ('from_me', 'is_from_me', 'direct'),
        ('event', 'message_type', 'direct'),
        ('status', 'ack_status', 'direct'),
        
        -- Context
        ('session_id', 'session_id', 'direct'),
        ('lead_id', 'lead_id', 'direct'),
        ('origem', 'origem', 'direct'),
        
        -- Additional Fields (Best Guess)
        ('contact_name', 'sender_name', 'direct'),
        ('url', 'media_url', 'direct'),           -- Common for media messages
        ('mimetype', 'file_type', 'direct')       -- Common for media messages
) AS m(external_path, internal_field, transform_type)
WHERE p.provider = 'chatpro'
ON CONFLICT (platform_id, external_path) 
DO UPDATE SET 
    internal_field = EXCLUDED.internal_field,
    transform_type = EXCLUDED.transform_type;

-- ============================================
-- 2. ECHO MAPPINGS
-- ============================================
INSERT INTO public.whatsapp_field_mappings (platform_id, external_path, internal_field, transform_type)
SELECT 
    p.id,
    m.external_path,
    m.internal_field,
    m.transform_type
FROM public.whatsapp_platforms p
CROSS JOIN (
    VALUES 
        -- Core Fields
        ('data.contact_phone', 'sender_phone', 'normalize_phone'),
        ('data.text', 'body', 'direct'),
        ('data.whatsapp_message_id', 'external_id', 'direct'),
        
        -- Metadata
        ('data.direction', 'direction', 'map_direction'),
        ('data.ts_iso', 'created_at', 'parse_timestamp'),
        ('data.from_me', 'is_from_me', 'direct'),
        ('data.event', 'message_type', 'direct'),
        ('data.status', 'ack_status', 'direct'),
        ('data.message_type', 'message_type', 'direct'),
        
        -- Context
        ('data.conversation_id', 'conversation_id', 'direct'),
        ('data.contact_name', 'sender_name', 'direct'),
        
        -- Additional Fields
        ('data.media_url', 'media_url', 'direct'),
        ('data.mimetype', 'file_type', 'direct')
) AS m(external_path, internal_field, transform_type)
WHERE p.provider = 'echo'
ON CONFLICT (platform_id, external_path) 
DO UPDATE SET 
    internal_field = EXCLUDED.internal_field,
    transform_type = EXCLUDED.transform_type;
