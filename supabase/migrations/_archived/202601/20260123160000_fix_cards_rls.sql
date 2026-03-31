-- Fix RLS policies for cards table to ensure updates are allowed
-- This addresses the 403 Forbidden error when moving cards between stages

BEGIN;

-- Enable RLS (ensure it's on)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- Drop potentially conflicting or restrictive policies
DROP POLICY IF EXISTS "Cards update by authenticated" ON public.cards;
DROP POLICY IF EXISTS "Cards update by admin" ON public.cards;
DROP POLICY IF EXISTS "Update cards" ON public.cards;
DROP POLICY IF EXISTS "Cards update by everyone" ON public.cards;

-- Re-create the permissive update policy for authenticated users
CREATE POLICY "Cards update by authenticated" ON public.cards
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMIT;
