-- Fix cards_origem_check constraint to include 'active_campaign'
-- This enables the integration processor to create cards from ActiveCampaign webhooks

-- Step 1: Drop the existing constraint
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_origem_check;

-- Step 2: Recreate with 'active_campaign' included
ALTER TABLE public.cards ADD CONSTRAINT cards_origem_check 
    CHECK (origem = ANY (ARRAY[
        'site'::text, 
        'indicacao'::text, 
        'sdr'::text, 
        'recorrencia'::text, 
        'manual'::text, 
        'outro'::text,
        'active_campaign'::text
    ]));

-- Add comment documenting the change
COMMENT ON CONSTRAINT cards_origem_check ON public.cards IS 
    'Allowed origem values. Updated 2026-01-21 to include active_campaign for AC integration.';
