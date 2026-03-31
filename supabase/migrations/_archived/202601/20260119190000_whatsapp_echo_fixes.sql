-- Migration: WhatsApp Echo Fixes
-- Date: 2026-01-19
-- Description: Add produto column, create custom fields table, deactivate ChatPro

-- ============================================
-- 1. ADD PRODUTO COLUMN TO whatsapp_messages
-- ============================================
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS produto text;

-- Index for filtering by product
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_produto 
ON public.whatsapp_messages(produto) 
WHERE produto IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.produto IS 'Product type: trips, weddings, corp, marketing, etc.';

-- ============================================
-- 2. CREATE whatsapp_custom_fields TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.whatsapp_custom_fields (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    platform_id uuid REFERENCES public.whatsapp_platforms(id) ON DELETE CASCADE,
    field_key text NOT NULL,
    field_label text NOT NULL,
    field_group text DEFAULT 'Customizado',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    UNIQUE(platform_id, field_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_custom_fields_platform 
ON public.whatsapp_custom_fields(platform_id);

-- ============================================
-- 3. RLS POLICIES FOR whatsapp_custom_fields
-- ============================================
ALTER TABLE public.whatsapp_custom_fields ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view custom fields
CREATE POLICY "Authenticated users can view whatsapp_custom_fields"
    ON public.whatsapp_custom_fields FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can manage their own custom fields
CREATE POLICY "Authenticated users can manage whatsapp_custom_fields"
    ON public.whatsapp_custom_fields FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================
-- 4. DEACTIVATE CHATPRO PLATFORMS
-- ============================================
-- Keep data for historical reference, but mark as inactive
UPDATE public.whatsapp_platforms 
SET is_active = false,
    updated_at = now()
WHERE provider = 'chatpro';

-- ============================================
-- 5. ENABLE REALTIME (if not already)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_custom_fields;
