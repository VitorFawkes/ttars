-- Migration: Fix RLS for whatsapp_field_mappings
-- Date: 2026-01-12
-- Description: Allow authenticated users to manage field mappings (not just admins)

-- Drop the restrictive admin-only policy
DROP POLICY IF EXISTS "Admins can manage whatsapp_field_mappings" ON public.whatsapp_field_mappings;

-- Create a more permissive policy for authenticated users
-- This makes sense because field mapping configuration should be accessible to team members
CREATE POLICY "Authenticated users can manage whatsapp_field_mappings"
    ON public.whatsapp_field_mappings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
