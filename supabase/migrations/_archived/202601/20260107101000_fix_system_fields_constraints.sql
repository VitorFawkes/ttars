-- Migration: Fix System Fields Constraints
-- Description: Adds 'textarea' to allowed types and ensures section/is_system columns exist.

-- 1. Ensure columns exist (idempotent)
ALTER TABLE system_fields 
ADD COLUMN IF NOT EXISTS section text DEFAULT 'details',
ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

-- 2. Update Check Constraint to allow 'textarea'
ALTER TABLE system_fields DROP CONSTRAINT IF EXISTS system_fields_type_check;
ALTER TABLE system_fields ADD CONSTRAINT system_fields_type_check 
CHECK (type IN ('text', 'textarea', 'number', 'date', 'currency', 'select', 'multiselect', 'boolean', 'json'));

-- 3. Update RLS to ensure authenticated users can insert
DROP POLICY IF EXISTS "Authenticated users can manage system_fields" ON system_fields;
CREATE POLICY "Authenticated users can manage system_fields" ON system_fields USING (auth.role() = 'authenticated');
