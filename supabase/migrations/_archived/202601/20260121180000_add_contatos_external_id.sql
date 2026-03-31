-- Migration: Add external_id and external_source to contatos
-- Purpose: Link CRM contacts to ActiveCampaign contacts for proper event processing
-- Timestamp: 20260121180000

-- 1. Add columns
ALTER TABLE public.contatos 
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_source TEXT;

-- 2. Add index for fast lookups (AC contact updates search by external_id)
CREATE INDEX IF NOT EXISTS idx_contatos_external_id 
ON public.contatos(external_id, external_source);

-- 3. Add comment for documentation
COMMENT ON COLUMN public.contatos.external_id IS 'External system contact ID (e.g., ActiveCampaign contact ID)';
COMMENT ON COLUMN public.contatos.external_source IS 'External system source identifier (e.g., "active_campaign")';
