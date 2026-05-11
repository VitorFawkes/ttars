-- ============================================================================
-- Migration: Fix audit_logs foreign key
-- Purpose: Allow user deletion by setting changed_by to NULL in audit_logs
-- ============================================================================

ALTER TABLE public.audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_changed_by_fkey;

ALTER TABLE public.audit_logs
ADD CONSTRAINT audit_logs_changed_by_fkey
FOREIGN KEY (changed_by)
REFERENCES auth.users(id)
ON DELETE SET NULL;
