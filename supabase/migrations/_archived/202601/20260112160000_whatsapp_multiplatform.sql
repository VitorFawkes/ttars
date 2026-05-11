-- Migration: WhatsApp Multi-Platform Integration
-- Date: 2026-01-12
-- Description: Creates tables for multi-platform WhatsApp integration (ChatPro, Echo)

-- ============================================
-- 1. PLATFORMS TABLE (ChatPro, Echo, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS public.whatsapp_platforms (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,                         -- "ChatPro", "Echo"
    provider text NOT NULL,                     -- 'chatpro' | 'echo'
    
    -- Platform-specific identifiers
    instance_id text,                           -- ChatPro instance_id if needed
    
    -- Configuration
    dashboard_url_template text,                -- URL template to open conversation: "https://app.chatpro.com/chat/{conversation_id}"
    api_base_url text,                          -- API base URL if available
    api_key_encrypted text,                     -- API Key (encrypted) for future use
    config jsonb DEFAULT '{}'::jsonb,           -- Extra configuration
    
    -- Status
    is_active boolean DEFAULT true,
    last_event_at timestamptz,                  -- Last webhook received
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Unique constraint on provider (one entry per provider for now, can be relaxed later)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_platforms_provider ON public.whatsapp_platforms(provider) WHERE is_active = true;

-- ============================================
-- 2. RAW EVENTS TABLE (Preserves original payloads)
-- ============================================
CREATE TABLE IF NOT EXISTS public.whatsapp_raw_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    platform_id uuid REFERENCES public.whatsapp_platforms(id) ON DELETE CASCADE,
    
    -- Event identification
    event_type text,                            -- 'received_message', 'sent_message', 'ack_update', 'message.received', etc.
    origem text,                                -- ChatPro: 'sdr-trips', 'travel-trips' | Echo: null
    idempotency_key text,                       -- message_id or whatsapp_message_id for dedup
    
    -- Raw payload
    raw_payload jsonb NOT NULL,
    
    -- Processing status
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'ignored')),
    processed_at timestamptz,
    error_message text,
    
    -- Extracted references (filled after processing)
    contact_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
    card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
    
    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_platform ON public.whatsapp_raw_events(platform_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_status ON public.whatsapp_raw_events(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_created ON public.whatsapp_raw_events(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_raw_events_idempotency ON public.whatsapp_raw_events(platform_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================
-- 3. FIELD MAPPINGS TABLE (Dynamic field mapping)
-- ============================================
CREATE TABLE IF NOT EXISTS public.whatsapp_field_mappings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    platform_id uuid REFERENCES public.whatsapp_platforms(id) ON DELETE CASCADE,
    
    -- Mapping definition
    external_path text NOT NULL,                -- JSONPath: 'contact_number', 'data.contact_phone', 'text'
    internal_field text NOT NULL,               -- Internal field: 'sender_phone', 'message_body', 'direction'
    
    -- Transform options
    transform_type text DEFAULT 'direct' CHECK (transform_type IN (
        'direct',           -- Direct copy
        'normalize_phone',  -- Remove non-digits
        'map_direction',    -- Map 'incoming'/'inbound' to standard
        'parse_timestamp',  -- Parse various timestamp formats
        'extract_json'      -- Parse nested JSON string
    )),
    transform_config jsonb DEFAULT '{}'::jsonb, -- Extra config for transforms (e.g., mapping table)
    
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(platform_id, external_path)
);

-- ============================================
-- 4. UPDATE whatsapp_messages TABLE
-- ============================================
-- Add new columns to existing table
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.whatsapp_platforms(id),
ADD COLUMN IF NOT EXISTS raw_event_id uuid REFERENCES public.whatsapp_raw_events(id),
ADD COLUMN IF NOT EXISTS conversation_id text,
ADD COLUMN IF NOT EXISTS session_id text,
ADD COLUMN IF NOT EXISTS lead_id text,
ADD COLUMN IF NOT EXISTS sender_name text,
ADD COLUMN IF NOT EXISTS sender_phone text,
ADD COLUMN IF NOT EXISTS origem text,
ADD COLUMN IF NOT EXISTS message_type text,
ADD COLUMN IF NOT EXISTS ack_status integer,
ADD COLUMN IF NOT EXISTS is_from_me boolean DEFAULT false;

-- Index for platform filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_platform ON public.whatsapp_messages(platform_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sender_phone ON public.whatsapp_messages(sender_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);

-- ============================================
-- 5. RLS POLICIES
-- ============================================
ALTER TABLE public.whatsapp_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_field_mappings ENABLE ROW LEVEL SECURITY;

-- Platforms: Read for all authenticated, Write for admins
CREATE POLICY "Authenticated users can view whatsapp_platforms"
    ON public.whatsapp_platforms FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage whatsapp_platforms"
    ON public.whatsapp_platforms FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Raw Events: Read for all authenticated (for debugging), Insert via service role only
CREATE POLICY "Authenticated users can view whatsapp_raw_events"
    ON public.whatsapp_raw_events FOR SELECT
    TO authenticated
    USING (true);

-- Field Mappings: Read for all authenticated, Write for admins
CREATE POLICY "Authenticated users can view whatsapp_field_mappings"
    ON public.whatsapp_field_mappings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins can manage whatsapp_field_mappings"
    ON public.whatsapp_field_mappings FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- ============================================
-- 6. SEED DEFAULT PLATFORMS
-- ============================================
INSERT INTO public.whatsapp_platforms (name, provider, config, dashboard_url_template)
VALUES 
    ('ChatPro', 'chatpro', '{"description": "ChatPro WhatsApp integration"}'::jsonb, NULL),
    ('Echo', 'echo', '{"description": "Echo WhatsApp integration"}'::jsonb, NULL)
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. SEED DEFAULT FIELD MAPPINGS - ChatPro
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
        ('contact_number', 'sender_phone', 'normalize_phone'),
        ('text', 'body', 'direct'),
        ('direction', 'direction', 'map_direction'),
        ('ts_iso', 'created_at', 'parse_timestamp'),
        ('message_id', 'external_id', 'direct'),
        ('session_id', 'session_id', 'direct'),
        ('lead_id', 'lead_id', 'direct'),
        ('origem', 'origem', 'direct'),
        ('from_me', 'is_from_me', 'direct'),
        ('event', 'message_type', 'direct'),
        ('status', 'ack_status', 'direct')
) AS m(external_path, internal_field, transform_type)
WHERE p.provider = 'chatpro'
ON CONFLICT (platform_id, external_path) DO NOTHING;

-- ============================================
-- 8. SEED DEFAULT FIELD MAPPINGS - Echo
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
        ('data.contact_phone', 'sender_phone', 'normalize_phone'),
        ('data.text', 'body', 'direct'),
        ('data.direction', 'direction', 'map_direction'),
        ('data.ts_iso', 'created_at', 'parse_timestamp'),
        ('data.whatsapp_message_id', 'external_id', 'direct'),
        ('data.conversation_id', 'conversation_id', 'direct'),
        ('data.contact_name', 'sender_name', 'direct'),
        ('data.from_me', 'is_from_me', 'direct'),
        ('data.event', 'message_type', 'direct'),
        ('data.status', 'ack_status', 'direct'),
        ('data.message_type', 'message_type', 'direct')
) AS m(external_path, internal_field, transform_type)
WHERE p.provider = 'echo'
ON CONFLICT (platform_id, external_path) DO NOTHING;

-- ============================================
-- 9. HELPER FUNCTION: Get value from JSON path
-- ============================================
CREATE OR REPLACE FUNCTION public.jsonb_get_path(data jsonb, path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    parts text[];
    result jsonb;
    i integer;
BEGIN
    -- Split path by '.'
    parts := string_to_array(path, '.');
    result := data;
    
    FOR i IN 1..array_length(parts, 1) LOOP
        result := result -> parts[i];
        IF result IS NULL THEN
            RETURN NULL;
        END IF;
    END LOOP;
    
    -- Return as text (remove quotes from strings)
    IF jsonb_typeof(result) = 'string' THEN
        RETURN result #>> '{}';
    ELSE
        RETURN result::text;
    END IF;
END;
$$;

-- ============================================
-- 10. TRIGGER: Update updated_at
-- ============================================
CREATE TRIGGER set_timestamp_whatsapp_platforms
    BEFORE UPDATE ON public.whatsapp_platforms
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

CREATE TRIGGER set_timestamp_whatsapp_field_mappings
    BEFORE UPDATE ON public.whatsapp_field_mappings
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();
