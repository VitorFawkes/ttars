-- Migration: WhatsApp Integration Foundation
-- Date: 2026-01-06
-- Description: Creates tables for WhatsApp messages and configuration, plus helper functions.

-- 1. Create normalize_phone function (Deterministic)
CREATE OR REPLACE FUNCTION public.normalize_phone(phone_number text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Removes all non-numeric characters
  RETURN regexp_replace(phone_number, '\D', '', 'g');
END;
$$;

-- 2. Create whatsapp_config table (Singleton)
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS for config
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Policy: Read-only for authenticated users (for UI/Functions)
CREATE POLICY "Authenticated users can view whatsapp_config"
    ON public.whatsapp_config FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Only admins can update (assuming admin role or specific user check - initially open to auth for setup, restrict later)
-- For now, allowing authenticated users to update for MVP setup, but ideally restricted to 'admin' role.
CREATE POLICY "Authenticated users can update whatsapp_config"
    ON public.whatsapp_config FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- 3. Create whatsapp_messages table
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id text UNIQUE, -- ChatPro ID / WhatsApp ID
    contact_id uuid REFERENCES public.contatos(id) ON DELETE SET NULL,
    direction text CHECK (direction IN ('inbound', 'outbound')),
    type text DEFAULT 'text', -- text, image, audio, etc.
    body text,
    media_url text,
    status text DEFAULT 'delivered', -- sent, delivered, read, failed
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(), -- Message timestamp
    processed_at timestamp with time zone DEFAULT now() -- System insertion timestamp
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_id ON public.whatsapp_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id ON public.whatsapp_messages(external_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policy: View messages if you have access to the contact (simplified to authenticated for now, can be tightened)
CREATE POLICY "Authenticated users can view whatsapp_messages"
    ON public.whatsapp_messages FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Insert/Update only by Service Role (Edge Functions)
-- Note: Supabase Service Role bypasses RLS, so we don't strictly need an INSERT policy for it if we don't grant INSERT to authenticated.
-- However, if we want to allow 'authenticated' to insert (e.g. for testing), we can add it.
-- For Elite security, we RESTRICT insert to service_role only.
-- So NO INSERT policy for 'authenticated'.

-- 4. Update contatos table
ALTER TABLE public.contatos 
ADD COLUMN IF NOT EXISTS chatpro_session_id text,
ADD COLUMN IF NOT EXISTS last_whatsapp_sync timestamp with time zone;

-- 5. Seed default config
INSERT INTO public.whatsapp_config (key, value, description)
VALUES 
    ('auto_create_leads', 'true'::jsonb, 'If true, creates a new Lead/Contact for unknown numbers.'),
    ('default_pipeline_id', 'null'::jsonb, 'UUID of the pipeline to create new leads in.'),
    ('default_stage_id', 'null'::jsonb, 'UUID of the stage to create new leads in.')
ON CONFLICT (key) DO NOTHING;
